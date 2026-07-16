describe("landing page", () => {
  it("renders the current product promise and toggles dark mode", () => {
    cy.visit("/")

    cy.contains("Where every idea can").should("be.visible")
    cy.contains("become").should("be.visible")
    cy.contains("a page.").should("be.visible")
    cy.contains("A workspace shaped by blocks").should("be.visible")
    cy.contains("A block-native writing surface.").should("be.visible")
    cy.contains("desafio").should("not.exist")
    cy.contains("M1").should("not.exist")
    cy.contains("local editor").should("not.exist")

    cy.get("body").then(($body) => {
      const body = $body[0]
      expect(body.scrollWidth).to.be.at.most(body.clientWidth + 1)
    })

    cy.get('[aria-label="Switch to dark mode"]').click()
    cy.get("html").should("have.class", "dark")
    cy.get("body").should("have.css", "background-color", "rgb(25, 25, 25)")
  })

  it("keeps the first viewport usable on mobile", () => {
    cy.viewport(390, 844)
    cy.visit("/")

    cy.contains("Where every idea can").should("be.visible")
    cy.contains("become").should("be.visible")
    cy.contains("a page.").should("be.visible")
    cy.contains("Create account").should("be.visible")
    cy.contains("A workspace shaped by blocks").should("be.visible")

    cy.get("body").then(($body) => {
      const body = $body[0]
      expect(body.scrollWidth).to.be.at.most(body.clientWidth + 1)
    })
  })

  it("switches to Portuguese and restores the preference", () => {
    cy.visit("/")
    cy.get('[data-cy="language-selector"]').click()
    cy.get('[data-cy="language-pt-BR"]').click()
    cy.contains("Criar conta").should("be.visible")
    cy.get("html").should("have.attr", "lang", "pt-BR")

    cy.reload()

    cy.contains("Criar conta").should("be.visible")
    cy.get("html").should("have.attr", "lang", "pt-BR")
  })
})
