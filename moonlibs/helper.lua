json = require('json')
e = require('cartridge.etcd-client')
etcd_client = require('moonlibs.etcd'):new{}
etcd_client:discovery()
session = {lock_delay = 10, connection = 1}

leaders_test = {A = 'a1', B = 'b1'}
