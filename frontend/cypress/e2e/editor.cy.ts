// Regressão: digitação em ordem (o bug do texto invertido vinha do React
// reescrevendo o text node do contenteditable a cada keystroke), split com
// Enter e undo coalescido.
describe("block editor", () => {
  function firstBlock() {
    return cy
      .get('[data-block-type="paragraph"] [contenteditable="true"]')
      .first()
  }

  beforeEach(() => {
    const id = Date.now()
    cy.visit("/signup")
    cy.get('[data-cy="signup-display-name"]').type("Editor Teste")
    cy.get('[data-cy="signup-email"]').type(`editor-${id}@example.com`)
    cy.get('[data-cy="signup-password"]').type("Password123!")
    cy.get('[data-cy="signup-confirm-password"]').type("Password123!")
    cy.get('[data-cy="signup-submit"]').click()
    cy.location("pathname").should("eq", "/dashboard")
  })

  it("types in order, splits with Enter, and undoes a typing burst", () => {
    cy.get('[data-cy="page-title"]').click().type("Minha página")
    cy.get('[data-cy="page-title"]').should("have.text", "Minha página")

    firstBlock().click().type("Teste de digitação")
    firstBlock().should("have.text", "Teste de digitação")

    firstBlock().type("{enter}segunda linha")
    cy.get('[data-block-type="paragraph"]').should("have.length", 2)
    cy.get('[data-block-type="paragraph"]')
      .eq(1)
      .should("have.text", "segunda linha")

    // Undo coalescido: a rajada "segunda linha" desfaz num passo só.
    cy.get("body").type("{meta}z")
    cy.get('[data-block-type="paragraph"]').should("have.length", 1)
  })

  it("keeps symbol-heavy typing stable", () => {
    firstBlock().click().type("# Título grande")
    firstBlock().should("have.text", "# Título grande")

    firstBlock().type("{enter}- item de lista")
    cy.get('[data-block-type="paragraph"]').should("have.length", 2)
    cy.get('[data-block-type="paragraph"]')
      .eq(1)
      .should("have.text", "- item de lista")
  })
})
