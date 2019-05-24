#!/usr/bin/env python3

import os
import pytest
import logging
import tempfile
import py
import tarantool
import time
import requests

from socket import socket, AF_INET, SOCK_DGRAM
from socket import timeout as SocketTimeout
from subprocess import Popen, PIPE, STDOUT

logging.basicConfig(format='%(name)s > %(message)s', level=logging.INFO)

srv_abspath = os.path.realpath(
    os.path.dirname(__file__)
)

TARANTOOL_CONNECTION_TIMEOUT = 5.0

COOKIE = 'cluster-cookies-for-the-cluster-monster'

class Helpers:
    @staticmethod
    def wait_for(fn, args=[], kwargs={}, timeout=TARANTOOL_CONNECTION_TIMEOUT):
        """Repeatedly call fn(*args, **kwargs)
        until it returns something or timeout occurs"""
        time_start = time.time()
        while True:
            now = time.time()
            if now > time_start + timeout:
                break

            try:
                return fn(*args, **kwargs)
            except:
                time.sleep(0.1)

        # after timeout call fn once more to propagate exception
        return fn(*args, **kwargs)

    @staticmethod
    def find(array, key, value):
        for item in array:
            if item[key] == value:
                return item

@pytest.fixture(scope='session')
def helpers():
    return Helpers

@pytest.fixture(scope='module')
def module_tmpdir(request):
    dir = py.path.local(tempfile.mkdtemp())
    request.addfinalizer(lambda: dir.remove(rec=1))
    return str(dir)


@pytest.fixture(scope='module')
def datadir(request):
    dir = os.path.join(request.fspath.dirname, 'data')

    return str(dir)


@pytest.fixture(scope='module')
def confdir(request):
    dir = os.path.join(request.fspath.dirname, 'config')

    return str(dir)

class Server(object):
    def __init__(self, binary_port, http_port,
                alias=None, instance_uuid=None,
                replicaset_uuid=None, roles=None,
                labels=None):

        self.alias = alias
        self.binary_port = binary_port
        self.http_port = http_port
        self.advertise_uri = 'localhost:{}'.format(self.binary_port)
        self.baseurl = 'http://localhost:{}'.format(http_port)

        self.conn = None
        self.env = None

        self.instance_uuid = instance_uuid
        self.replicaset_uuid = replicaset_uuid
        self.roles = roles
        self.labels = labels

        pass

    def start(self, workdir=None, env={}):
        if self.env == None:
            self.env = os.environ.copy()
            self.env['ALIAS'] = str(self.alias)
            self.env['WORKDIR'] = str(workdir)
            self.env['HTTP_PORT'] = str(self.http_port)
            self.env['ADVERTISE_URI'] = str(self.advertise_uri)
            self.env['CLUSTER_COOKIE'] = COOKIE

        command = [os.path.join(srv_abspath, 'instance.lua')]

        logging.warn('export ALIAS="{}"'.format(self.env['ALIAS']))
        logging.warn('export WORKDIR="{}"'.format(self.env['WORKDIR']))
        logging.warn('export HTTP_PORT="{}"'.format(self.env['HTTP_PORT']))
        logging.warn('export ADVERTISE_URI="{}"'.format(self.env['ADVERTISE_URI']))
        logging.warn('export CLUSTER_COOKIE="{}"'.format(self.env['CLUSTER_COOKIE']))
        for var_name, var_value in env.items():
            logging.warn('export {}="{}"'.format(var_name, var_value))
            self.env[var_name] = var_value
        logging.warn(' '.join(command))

        self.process = Popen(command, env=self.env)
        logging.warn('PID %d', self.process.pid)

    def ping_udp(self):
        s = socket(AF_INET, SOCK_DGRAM)
        s.settimeout(0.1)
        try:
            addr = ('127.0.0.1', self.binary_port)
            s.connect_ex(addr)
            s.send(b'PING')
            try:
                s.recv(1024)
            except SocketTimeout as e:
                # Since the server does not reply to non-members
                # we expect recvfrom() to raise timeout error
                pass

            logging.warning('Ping UDP localhost:{} succeeded'.format(self.binary_port))
        finally:
            s.close()

    def connect(self):
        assert self.process.poll() is None
        if self.conn == None:
            self.conn = tarantool.connect(
                '127.0.0.1', self.binary_port,
                user='cluster',
                password=self.env['CLUSTER_COOKIE']
            )
        resp = self.conn.eval('return is_initialized()')
        err = resp[1] if len(resp) > 1 else None
        assert (resp[0], err) == (True, None)

    def cluster_is_healthy(self):
        self.conn.eval("assert(package.loaded['cluster'].is_healthy())")

    def kill(self):
        if self.conn != None:
            # logging.warn('Closing connection to {}'.format(self.port))
            self.conn.close()
            self.conn = None
        self.process.kill()
        logging.warn('localhost:'+str(self.binary_port)+' killed')

    def get(self, path, data=None, json=None, headers=None, **args):
        url = self.baseurl + '/' + path.lstrip('/')
        r = requests.get(url, data=data, json=json, headers=headers, **args)
        r.raise_for_status()

        return r.text

    def get_raw(self, path, data=None, json=None, headers=None, **args):
        url = self.baseurl + '/' + path.lstrip('/')
        r = requests.get(url, data=data, json=json, headers=headers, **args)
        r.raise_for_status()

        return r

    def put(self, path, data=None, json=None, headers=None, **args):
        url = self.baseurl + '/' + path.lstrip('/')
        r = requests.put(url, data=data, json=json, headers=headers, **args)
        r.raise_for_status()

        return r.text

    def put_raw(self, path, data=None, json=None, headers=None, **args):
        url = self.baseurl + '/' + path.lstrip('/')
        r = requests.put(url, data=data, json=json, headers=headers, **args)

        return r

    def post(self, path, data=None, json=None, headers=None, **args):
        url = self.baseurl + '/' + path.lstrip('/')
        r = requests.post(url, data=data, json=json, headers=headers, **args)
        r.raise_for_status()

        return r.text

    def post_raw(self, path, data=None, json=None, headers=None, **args):
        url = self.baseurl + '/' + path.lstrip('/')
        r = requests.post(url, data=data, json=json, headers=headers, **args)

        return r

    def graphql(self, query, variables=None, headers=None, **args):
        url = self.baseurl + '/admin/api'

        request = {"query": query, "variables": variables}

        # logging.warn(request)

        r = requests.post(url,
            json=request,
            headers=headers,
            timeout=TARANTOOL_CONNECTION_TIMEOUT,
            **args
        )

        r.raise_for_status()

        json = r.json()
        if 'errors' in json:
            logging.warning(json['errors'])
        return json

@pytest.fixture(scope="module")
def cluster(request, confdir, module_tmpdir, helpers):
    cluster = {}
    servers = getattr(request.module, "cluster")
    bootserv = None

    for srv in servers:
        assert srv.roles != None
        assert srv.alias != None
        srv.start(
            workdir="{}/localhost-{}".format(module_tmpdir, srv.binary_port),
        )
        request.addfinalizer(srv.kill)
        helpers.wait_for(srv.ping_udp)
        if len(cluster) == 0:
            bootserv = srv
            helpers.wait_for(srv.graphql, ["{}"])
        else:
            helpers.wait_for(bootserv.conn.eval,
                ["assert(require('membership').probe_uri(...))", srv.advertise_uri]
            )

        logging.warn('Join {} ({}) {} '.format(srv.advertise_uri, srv.alias, srv.roles))
        resp = bootserv.graphql(
            query = """
                mutation(
                    $uri: String!
                    $instance_uuid: String
                    $replicaset_uuid: String
                    $roles: [String!]
                    $timeout: Float,
                    $labels: [LabelInput]
                ) {
                    join_server(
                        uri: $uri,
                        instance_uuid: $instance_uuid,
                        replicaset_uuid: $replicaset_uuid,
                        roles: $roles
                        timeout: $timeout
                        labels: $labels
                    )
                }
            """,
            variables = {
                "uri": srv.advertise_uri,
                "instance_uuid": srv.instance_uuid,
                "replicaset_uuid": srv.replicaset_uuid,
                "roles": srv.roles,
                "timeout": TARANTOOL_CONNECTION_TIMEOUT,
                "labels": srv.labels
            }
        )
        assert "errors" not in resp, resp['errors'][0]['message']

        # wait when server is bootstrapped
        helpers.wait_for(srv.connect)

        if len(cluster) != 0:
            # wait for bootserv to see that the new member is alive
            helpers.wait_for(bootserv.cluster_is_healthy)

        # speedup tests by amplifying membership message exchange
        srv.conn.eval('require("membership.options").PROTOCOL_PERIOD_SECONDS = 0.2')

        cluster[srv.alias] = srv

    routers = [srv for srv in servers if 'vshard-router' in srv.roles]
    if len(routers) > 0:
        srv = routers[0]
        resp = srv.graphql(
            query = """
                {
                    cluster { can_bootstrap_vshard }
                }
            """
        )
        assert 'errors' not in resp, resp['errors'][0]['message']
        assert resp['data']['cluster']['can_bootstrap_vshard']

        logging.warn('Bootstrapping vshard.router on {}'.format(srv.advertise_uri))
        resp = srv.graphql(
            query = """
                mutation { bootstrap_vshard }
            """
        )
        assert 'errors' not in resp, resp['errors'][0]['message']
    else:
        logging.warn('No vshard routers configured, skipping vshard bootstrap')

    return cluster