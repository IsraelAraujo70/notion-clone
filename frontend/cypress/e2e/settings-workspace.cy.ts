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

    cy.location("pathname").should("eq", "/dashboard")
    cy.get('[data-cy="user-menu-trigger"]').click()
    cy.get('[data-cy="create-workspace-menu-item"]').click()
    cy.get('[data-cy="workspace-name"]').type(workspaceName)
    cy.get('[data-cy="create-workspace-submit"]').click()

    cy.get("body").then(($body) => {
      if ($body.find('[data-cy="user-settings"]').length === 0) {
        cy.get('[data-cy="user-menu-trigger"]').click()
      }
    })
    cy.get('[data-cy="user-settings"]').click()
    cy.get('[data-cy="settings-dialog"]').should("be.visible")

    cy.contains("button", "Aparência").click()
    cy.get('[data-cy="theme-dark"]').click()
    cy.document().its("documentElement.dataset.theme").should("eq", "dark")
    cy.get("html").should("have.class", "dark")

    cy.get('[data-cy="theme-evergreen"]').click()
    cy.document().its("documentElement.dataset.theme").should("eq", "evergreen")
    cy.get("html").should("not.have.class", "dark")

    cy.get('[data-cy="theme-light"]').click()
    cy.document().its("documentElement.dataset.theme").should("eq", "light")

    cy.contains("button", "Workspace").click()
    cy.get('[data-cy="workspace-invite-form"]').should("be.visible")
    cy.get('[data-cy="workspace-invite-email"]').should("be.visible")
    cy.get('[data-cy="workspace-invite-submit"]').should("be.visible")
  })
})
