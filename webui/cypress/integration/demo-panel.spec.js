describe('Demo panel', () => {

  before(() => {
    cy.task('tarantool', {
      code: `
      cleanup()
      _G.cluster = helpers.Cluster:new({
        datadir = fio.tempdir(),
        use_vshard = false,
        server_command = helpers.entrypoint('srv_basic'),
        cookie = helpers.random_cookie(),
        replicasets = {{
          uuid = helpers.uuid('a'),
          alias = 'a',
          roles = {},
          servers = {{http_port = 8080}},
        }}
      })

      _G.cluster:start()
      return true
    `
    }).should('deep.eq', [true]);
  });

  after(() => {
    cy.task('tarantool', { code: `cleanup()` });
  });

  it('Test: demo-panel', () => {

    ////////////////////////////////////////////////////////////////////
    cy.log('Check absence');
    ////////////////////////////////////////////////////////////////////
    cy.visit('/');

    cy.get('a[href="/admin/cluster/dashboard"]').click();
    cy.get('.meta-test__ProbeServerBtn').should('exist');
    cy.get('.meta-test__DemoInfo').should('not.exist');

    cy.get('a[href="/admin/cluster/users"]').click();
    cy.get('.meta-test__addUserBtn').should('exist');
    cy.get('.meta-test__DemoInfo').should('not.exist');

    cy.get('a[href="/admin/cluster/configuration"]').click();
    cy.get('.meta-test__DownloadBtn').should('exist');
    cy.get('.meta-test__DemoInfo').should('not.exist');

    cy.get('a[href="/admin/cluster/code"]').click();
    cy.get('.meta-test__Code__apply_idle').should('exist');
    cy.get('.meta-test__DemoInfo').should('not.exist');

    ////////////////////////////////////////////////////////////////////
    cy.log('Restart with demo uri');
    ////////////////////////////////////////////////////////////////////
    cy.task('tarantool', {
      code: `
      _G.cluster.main_server:stop()
      _G.cluster.main_server.env['TARANTOOL_DEMO_URI'] =
        'admin:password@try-cartridge.tarantool.io:26333'
      _G.cluster.main_server:start()
      return true
    `
    }).should('deep.eq', [true]);

    ////////////////////////////////////////////////////////////////////
    cy.log('Check presence');
    ////////////////////////////////////////////////////////////////////
    cy.reload();

    cy.get('a[href="/admin/cluster/dashboard"]').click();
    cy.url().should('include', '/admin/cluster/dashboard');
    cy.get('.meta-test__ProbeServerBtn').should('exist');

    cy.get('.meta-test__DemoInfo').contains('Your demo server is created. Temporary address of your server:');
    cy.get('.meta-test__DemoInfo button[type="button"]:contains(How to connect?)').click();
    cy.get('.meta-test__DemoInfo_modal').contains('Connect to Tarantool Cartridge using python client');
    cy.get('.meta-test__DemoInfo_modal button:contains(PHP)').click();
    cy.get('.meta-test__DemoInfo_modal').contains('Connect to Tarantool Cartridge using PHP client');
    cy.get('.meta-test__DemoInfo_modal button:contains(Close)').click();

    cy.get('a[href="/admin/cluster/users"]').click();
    cy.url().should('include', '/admin/cluster/users');
    cy.get('.meta-test__DemoInfo').should('exist');

    cy.get('a[href="/admin/cluster/configuration"]').click();
    cy.url().should('include', '/admin/cluster/configuration');
    cy.get('.meta-test__DemoInfo').should('exist');

    cy.get('a[href="/admin/cluster/code"]').click();
    cy.url().should('include', '/admin/cluster/code');
    cy.get('.meta-test__DemoInfo').should('exist');

    cy.get('.meta-test__DemoInfo button[type="button"]:contains(Reset configuration)').click();
    cy.get('div:contains(Do you really want to reset your settings?)').find('button:contains(Reset)').click();
    cy.url().should('include', '/admin/cluster/dashboard');
    cy.get('h1:contains(Cluster)');
  });
});
