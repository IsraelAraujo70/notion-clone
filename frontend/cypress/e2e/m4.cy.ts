describe("M4 search, sharing, and permanent deletion", () => {
  it("finds a block, publishes read-only, revokes, and purges the page", () => {
    const email = `m4-${Date.now()}@example.com`

    cy.signupByApi(email).then((auth) => {
      cy.api<Array<{ id: string }>>("GET", "/workspaces", {
        token: auth.token,
      }).then((workspaces) => {
        const workspaceId = workspaces.body[0].id
        cy.api<{ pages: Array<{ id: string }> }>(
          "GET",
          `/workspaces/${workspaceId}/pages`,
          { token: auth.token }
        ).then((pages) => {
          const pageId = pages.body.pages[0].id
          const pagePath = `/dashboard/pages/${pageId}`

          cy.authenticatedVisit(pagePath, auth.token)
          cy.get('[data-cy="page-title"]').click().type("Entrega M4")
          cy.get('[data-block-type="paragraph"] [contenteditable="true"]')
            .first()
            .click()
            .type("agulha permissionada do cypress")
          cy.get('[data-cy="save-state"]').should(
            "have.attr",
            "data-state",
            "saved"
          )

          cy.get('[data-cy="command-trigger"]').click()
          cy.get('[data-cy="command-input"]').type("agulha permissionada")
          cy.get(`[data-cy^="command-search-result-"]`)
            .should("have.length", 1)
            .click()
          cy.location("search").should("contain", "block=")
          cy.get('[data-block-id][aria-current="location"]').should(
            "contain.text",
            "agulha permissionada"
          )

          cy.get('[data-cy="share-open"]').click()
          cy.get('[data-cy="share-create"]').click()
          cy.get('[data-cy="share-url"]')
            .invoke("val")
            .should("match", /\/share\//)
            .then((value) => {
              const publicUrl = String(value)

              cy.visit(publicUrl)
              cy.get('[data-cy="public-page"]').should(
                "contain.text",
                "Entrega M4"
              )
              cy.get('[data-cy="public-page"]').should(
                "contain.text",
                "agulha permissionada"
              )
              cy.get('[contenteditable="true"]').should("not.exist")
              cy.get('[data-cy="save-state"]').should("not.exist")
              cy.get('[data-cy="share-open"]').should("not.exist")

              cy.authenticatedVisit(pagePath, auth.token)
              cy.get('[data-cy="share-open"]').click()
              cy.get('[data-cy="share-revoke"]').click()
              cy.get('[data-cy="share-create"]').should("be.visible")

              cy.visit(publicUrl)
              cy.get('[data-cy="public-page-error"]').should(
                "contain.text",
                "Página não encontrada"
              )

              cy.authenticatedVisit(pagePath, auth.token)
              cy.get(`[data-cy="nav-page-${pageId}"]`).rightclick()
              cy.get('[data-cy="nav-page-delete"]').click()
              cy.get('[data-cy="trash-trigger"]').click()
              cy.get(`[data-cy="trash-entry-${pageId}"]`).should("be.visible")
              cy.get(`[data-cy="trash-delete-permanently-${pageId}"]`).click()
              cy.get('[data-cy="trash-delete-confirm-dialog"]').should(
                "contain.text",
                "toda a subárvore"
              )
              cy.get('[data-cy="trash-delete-confirm"]').click()
              cy.get(`[data-cy="trash-entry-${pageId}"]`).should("not.exist")

              cy.api("GET", `/workspaces/${workspaceId}/pages/${pageId}`, {
                token: auth.token,
                failOnStatusCode: false,
              })
                .its("status")
                .should("eq", 404)
            })
        })
      })
    })
  })
})
