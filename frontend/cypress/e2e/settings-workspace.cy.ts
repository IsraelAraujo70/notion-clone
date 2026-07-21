describe("settings and workspace", () => {
  it("creates a workspace, switches themes and opens owner workspace settings", () => {
    const id = Date.now()
    const email = `settings-${id}@example.com`
    const workspaceName = `Workspace ${id}`

    cy.visit("/signup")
    cy.get('[data-cy="signup-display-name"]').type("Usuário Settings")
    cy.get('[data-cy="signup-email"]').type(email)
    cy.get('[data-cy="signup-password"]').type("Password123!")
    cy.get('[data-cy="signup-confirm-password"]').type("Password123!")
    cy.get('[data-cy="signup-submit"]').click()

    cy.location("pathname").should("eq", "/dashboard/ai")
    cy.get('[data-cy^="nav-page-"]').filter("a").first().click()
    cy.location("pathname").should("match", /^\/dashboard\/pages\//)
    cy.location("pathname").then((personalPath) => {
      cy.get('[data-cy="user-menu-trigger"]').click()
      cy.get('[data-cy="create-workspace-menu-item"]').click()
      cy.get('[data-cy="workspace-name"]').type(workspaceName)
      cy.get('[data-cy="create-workspace-submit"]').click()

      cy.location("pathname").should("eq", "/dashboard/ai")
      cy.get('[data-cy^="nav-page-"]').filter("a").first().click()
      cy.location("pathname").should("not.eq", personalPath)
      cy.get('[data-cy="page-title"]').should("be.visible")
    })

    cy.get("body").then(($body) => {
      if ($body.find('[data-cy="user-settings"]').length === 0) {
        cy.get('[data-cy="user-menu-trigger"]').click()
      }
    })
    cy.get('[data-cy="user-settings"]').click()
    cy.get('[data-cy="settings-dialog"]').should("be.visible")
    cy.get('[data-cy="page-content"]').should(
      "have.attr",
      "data-layout",
      "centered"
    )

    cy.contains("button", "Appearance").click()
    cy.get('[data-cy="page-full-width"]')
      .should("have.attr", "aria-checked", "false")
      .click()
    cy.get('[data-cy="page-content"]').should(
      "have.attr",
      "data-layout",
      "full-width"
    )
    cy.get('[data-cy="theme-github"]').click()
    cy.document().its("documentElement.dataset.theme").should("eq", "github")
    cy.document().its("documentElement.dataset.themeMode").should("eq", "light")
    cy.get("html").should("not.have.class", "dark")

    cy.get('[data-cy="theme-mode-dark"]').click()
    cy.document().its("documentElement.dataset.theme").should("eq", "github")
    cy.document().its("documentElement.dataset.themeMode").should("eq", "dark")
    cy.get("html").should("have.class", "dark")

    cy.get('[data-cy="theme-evergreen"]').click()
    cy.document().its("documentElement.dataset.theme").should("eq", "evergreen")
    cy.document().its("documentElement.dataset.themeMode").should("eq", "dark")
    cy.get("html").should("have.class", "dark")

    cy.get('[data-cy="theme-mode-light"]').click()
    cy.document().its("documentElement.dataset.theme").should("eq", "evergreen")
    cy.document().its("documentElement.dataset.themeMode").should("eq", "light")
    cy.get("html").should("not.have.class", "dark")

    cy.get("body").type("{esc}")
    cy.reload()
    cy.get('[data-cy="page-content"]').should(
      "have.attr",
      "data-layout",
      "full-width"
    )

    cy.get('[data-cy="user-menu-trigger"]').click()
    cy.get('[data-cy="user-settings"]').click()
    cy.contains("button", "Appearance").click()
    cy.get('[data-cy="page-full-width"]').click()
    cy.get('[data-cy="page-content"]').should(
      "have.attr",
      "data-layout",
      "centered"
    )

    cy.contains("button", "Workspace").click()
    cy.get('[data-cy="workspace-invite-form"]').should("be.visible")
    cy.get('[data-cy="workspace-invite-email"]').should("be.visible")
    cy.get('[data-cy="workspace-invite-submit"]').should("be.visible")

    cy.contains("button", "Appearance").click()
    cy.get('[data-cy="page-full-width"]').click()
    cy.get("body").type("{esc}")
    cy.viewport(375, 812)
    cy.get('[data-cy="page-content"]').should(
      "have.attr",
      "data-layout",
      "full-width"
    )
    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.be.at.most(
        document.documentElement.clientWidth
      )
    })
  })
})
