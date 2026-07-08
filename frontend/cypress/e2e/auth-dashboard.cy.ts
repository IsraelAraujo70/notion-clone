describe("auth and dashboard shell", () => {
  it("signs up through the UI, logs out, logs in, and opens command palette", () => {
    const id = Date.now()
    const email = `starter-${id}@example.com`

    cy.visit("/signup")
    cy.get('[data-cy="signup-display-name"]').type("Usuário Teste")
    cy.get('[data-cy="signup-email"]').type(email)
    cy.get('[data-cy="signup-password"]').type("Password123!")
    cy.get('[data-cy="signup-confirm-password"]').type("Password123!")
    cy.get('[data-cy="signup-submit"]').click()

    // `/dashboard` redireciona para a página raiz persistida do workspace.
    cy.location("pathname").should("match", /^\/dashboard\/pages\/[0-9a-f-]{36}$/)
    cy.get('[data-cy="page-title"]').should("be.visible").and("have.text", "")
    cy.get('[data-cy^="nav-page-"]').should("be.visible")
    cy.get('[data-cy="command-trigger"]').should("be.visible")
    cy.get('[data-cy="command-trigger"]')
      .parents('[data-slot="sidebar-group"]')
      .next()
      .should("contain", "Páginas")

    cy.get('[data-cy="command-trigger"]').click()
    cy.get('[data-cy="command-log-out"]').click()
    cy.location("pathname").should("eq", "/")

    cy.visit("/login")
    cy.get('[data-cy="login-email"]').type(email)
    cy.get('[data-cy="login-password"]').type("Password123!")
    cy.get('[data-cy="login-submit"]').click()
    cy.location("pathname").should("match", /^\/dashboard\/pages\//)

    cy.location("pathname").then((pathname) => {
      cy.get('[data-cy="command-trigger"]').click()
      cy.get('[data-cy="command-input"]').should("be.visible")
      cy.get('[data-cy^="command-go-page-"]').first().click()
      cy.location("pathname").should("eq", pathname)
    })
  })

  it("shows non-enumerating forgot-password success copy", () => {
    cy.visit("/login")
    cy.get('[data-cy="login-email"]').type("missing@example.com")
    cy.contains("Esqueceu a senha?").click()
    cy.get('[data-cy="login-submit"]').click()
    cy.contains(
      "Se esse email tiver conta, o link de redefinição foi enviado."
    ).should("be.visible")
  })
})
