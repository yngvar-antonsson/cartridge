import React from 'react';
import { Route, Switch } from 'react-router-dom';

import { isGraphqlErrorResponse, isGraphqlAccessDeniedError } from 'src/api/graphql';
import { isRestErrorResponse, isRestAccessDeniedError } from 'src/api/rest';
import { getErrorMessage } from 'src/api';
import ClusterPage from 'src/pages/Cluster';
import {
  SplashError
} from '@tarantool.io/ui-kit';

class App extends React.Component {
  render() {
    const {
      appDataRequestStatus,
      appDataRequestError,
      authorizationRequired
    } = this.props;
    const isLoading = !appDataRequestStatus.loaded;

    return isLoading || authorizationRequired
      ? null
      : appDataRequestError
        ? this.renderError()
        : this.renderApp();
  }

  renderApp = () => {
    return (
      <Switch>
        {/* <Route path={`/cluster/dashboard/instance/:instanceUUID`} component={ClusterPage} /> */}
        <Route component={ClusterPage} />
      </Switch>
    );
  };

  renderError = () => {
    const { appDataRequestError: error } = this.props;

    let title = '';
    //TODO: consider whether it is really important to distinguish "access denied" errors from others
    if (isNotAccessError(error)) {
      title = 'Request failed';
    } else {
      title = 'Sorry, something went wrong';
    }

    const description = getErrorMessage(error);

    return (
      <SplashError
        title={title}
        description={description}
      />
    );
  };
}

const isNotAccessError = error => {
  if (
    (isRestErrorResponse(error) && !isRestAccessDeniedError(error))
    ||
    (isGraphqlErrorResponse(error) && !isGraphqlAccessDeniedError(error))
  ) {
    return true;
  }
  return false;
};


export default App;
