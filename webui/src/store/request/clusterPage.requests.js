// @flow
import graphql from 'src/api/graphql';
import rest from 'src/api/rest';
import { getApiEndpoint } from 'src/apiEndpoints';
import { getClusterSelf } from 'src/store/request/app.requests';
import {
  bootstrapMutation,
  changeFailoverMutation,
  configForceReapplyMutation,
  disableServersMutation,
  editTopologyMutation,
  listQuery,
  probeMutation,
  promoteFailoverLeaderMutation,
  serverStatQuery,
  getFailoverParams,
  restartReplicationMutation
} from './queries.graphql';
import type {
  EditTopologyMutationVariables,
  EditServerInput,
  FailoverApi
} from 'src/generated/graphql-typing'

const filterServerStat = response => {
  const serverStat
    = response.serverStat.filter(
      stat => stat.uuid
        && stat.statistics
        && !Array.isArray(stat.statistics)
    );
  return {
    ...response,
    serverStat
  };
};

type RefreshListsArgs = {
  shouldRequestStat?: boolean
};

export function refreshLists(params: RefreshListsArgs = {}) {
  return graphql.fetch(listQuery, { withStats: !!params.shouldRequestStat })
    .then(
      ({ replicasetList, serverList, ...rest }) => ({
        replicasetList: replicasetList.map(({ servers, ...rest }) => ({
          servers: servers.map(
            ({ boxinfo, ...server }) => ({
              boxinfo,
              ro: (boxinfo && boxinfo.general && boxinfo.general.ro),
              ...server
            })
          ),
          ...rest
        })),
        serverList: serverList.map(
          ({ boxinfo, ...server }) => ({
            boxinfo,
            ro: (boxinfo && boxinfo.general && boxinfo.general.ro),
            ...server
          })
        ),
        ...rest
      })
    )
    .then(
      params.shouldRequestStat
        ? ({
          cluster: {
            issues,
            suggestions
          },
          ...response
        }) => filterServerStat({
          ...response,
          issues,
          suggestions
        })
        : null
    );
}

export function getPageData() {
  return refreshLists({ shouldRequestStat: true });
}

export function getServerStat() {
  return graphql.fetch(serverStatQuery)
    .then(filterServerStat);
}

export function bootstrapVshard() {
  return graphql.mutate(bootstrapMutation);
}

type ProbeServerArgs = {
  uri: string
};

export function probeServer(params: ProbeServerArgs) {
  return graphql.mutate(probeMutation, params);
}

type JoinServerArgs = {
  uri: string,
  uuid: string
};

export function joinServer({ uri, uuid }: JoinServerArgs) {
  const mutationVariables: EditTopologyMutationVariables = {
    replicasets: [
      { uuid, join_servers: [{ uri }] }
    ]
  };

  return graphql.mutate(editTopologyMutation, mutationVariables);
}

export function disableServer(uuid: string, disable: boolean) {
  const mutationVariables: EditTopologyMutationVariables = {
    servers: [
      { uuid, disabled: disable }
    ]
  };

  return graphql.mutate(editTopologyMutation, mutationVariables);
}

export type CreateReplicasetArgs = {
  alias: string,
  all_rw: boolean,
  roles: string[],
  uri: string,
  vshard_group: string,
  weight: number
};

export function createReplicaset(
  {
    alias,
    all_rw,
    roles,
    uri,
    vshard_group,
    weight
  }: CreateReplicasetArgs
) {
  const mutationVariables: EditTopologyMutationVariables = {
    replicasets: [
      {
        alias,
        all_rw,
        roles,
        vshard_group,
        weight,
        join_servers: [{ uri }]
      }
    ]
  };

  return graphql.mutate(editTopologyMutation, mutationVariables);
}

type ExpelServerArgs = {
  uuid: string
};

export function expelServer({ uuid }: ExpelServerArgs) {
  const mutationVariables: EditTopologyMutationVariables = {
    servers: [
      { uuid, expelled: true }
    ]
  };

  return graphql.mutate(editTopologyMutation, mutationVariables);
}

export function editServers(servers: EditServerInput[]) {
  return graphql.mutate(editTopologyMutation, { servers });
}

export type EditReplicasetArgs = {
  alias: string,
  all_rw: boolean,
  master: string[],
  roles: string[],
  uuid: string,
  vshard_group: string,
  weight: number
};

export function editReplicaset(
  {
    alias,
    all_rw,
    master,
    roles,
    uuid,
    vshard_group,
    weight
  }: EditReplicasetArgs
) {
  const mutationVariables: EditTopologyMutationVariables = {
    replicasets: [
      {
        alias,
        all_rw,
        failover_priority: master,
        roles,
        uuid,
        vshard_group,
        weight
      }
    ]
  };

  return graphql.mutate(editTopologyMutation, mutationVariables);
}

type UploadConfigParams = { data: FormData };

export async function uploadConfig(params: UploadConfigParams) {
  return rest.put(getApiEndpoint('CONFIG_ENDPOINT'), params.data, {
    headers: { 'Content-Type': 'application/yaml;charset=UTF-8' }
  });
}

export async function changeFailover(params: FailoverApi) {
  await graphql.mutate(changeFailoverMutation, params);
  return await getClusterSelf();
}

export async function promoteFailoverLeader(params: FailoverApi) {
  return await graphql.mutate(promoteFailoverLeaderMutation, params);
}

export const disableServers = (uuids: Array<string>) => graphql.mutate(
  disableServersMutation,
  { uuids }
);

export const restartReplications = (uuids: Array<string>) => graphql.mutate(
  restartReplicationMutation,
  { uuids }
);

export const configForceReapply = (uuids: Array<string>) => graphql.mutate(
  configForceReapplyMutation,
  { uuids }
);

export async function getFailover() {
  return await graphql.fetch(getFailoverParams);
}
