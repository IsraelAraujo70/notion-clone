describe("auth and dashboard shell", () => {
  it("keeps the sidebar mounted when navigating between pages", () => {
    const id = Date.now()
    let workspaceListRequests = 0
    let pageListRequests = 0

    cy.intercept("GET", "**/workspaces", () => {
      workspaceListRequests += 1
    })
    cy.intercept("GET", /\/workspaces\/[^/]+\/pages(?:\?.*)?$/, () => {
      pageListRequests += 1
    })

    cy.signupByApi(`sidebar-${id}@example.com`).then(({ token }) => {
      cy.authenticatedVisit("/dashboard", token)
      cy.location("pathname").should("match", /^\/dashboard\/pages\//)
      cy.get('[data-cy="page-title"]').should("be.visible")

      cy.location("pathname").then((firstPath) => {
        const firstPageId = firstPath.split("/").pop()!

        cy.get('[data-cy="nav-pages-create"]').click()
        cy.location("pathname").should("not.eq", firstPath)
        cy.get('[data-cy="page-title"]').should("be.visible")
        cy.get(`[data-cy="nav-page-${firstPageId}"]`).should("be.visible")

        cy.then(() => {
          workspaceListRequests = 0
          pageListRequests = 0
        })

        cy.get('[data-slot="sidebar-container"]').then(($sidebar) => {
          const sidebar = $sidebar[0]

          cy.get(`[data-cy="nav-page-${firstPageId}"]`).click()
          cy.location("pathname").should("eq", firstPath)
          cy.get(`[data-cy="nav-page-${firstPageId}"]`).should(
            "have.attr",
            "data-active",
            "true"
          )
          cy.get('[data-slot="sidebar-container"]')
            .should(($current) => {
              expect($current[0]).to.equal(sidebar)
            })
            .find('[data-slot="skeleton"]')
            .should("not.exist")

          cy.then(() => {
            expect(workspaceListRequests).to.equal(0)
            expect(pageListRequests).to.equal(0)
          })
        })
      })
    })
  })

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
    cy.location("pathname").should(
      "match",
      /^\/dashboard\/pages\/[0-9a-f-]{36}$/
    )
    cy.get('[data-cy="page-title"]').should("be.visible").and("have.text", "")
    cy.get('[data-cy^="nav-page-"]').should("be.visible")
    cy.get('[data-cy="command-trigger"]').should("be.visible")
    cy.get('[data-cy="command-trigger"]')
      .parents('[data-slot="sidebar-group"]')
      .next()
      .should("contain", "Pages")

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
    cy.contains("Forgot password?").click()
    cy.get('[data-cy="login-submit"]').click()
    cy.contains(
      "If an account exists for this email, a reset link was sent."
    ).should("be.visible")
  })
})
