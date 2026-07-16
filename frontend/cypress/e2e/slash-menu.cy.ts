describe("slash block menu", () => {
  function firstBlock() {
    return cy.get('[data-block-type] [contenteditable="true"]').first()
  }

  beforeEach(() => {
    const id = Date.now()
    cy.visit("/signup")
    cy.get('[data-cy="signup-display-name"]').type("Slash Menu Teste")
    cy.get('[data-cy="signup-email"]').type(`slash-${id}@example.com`)
    cy.get('[data-cy="signup-password"]').type("Password123!")
    cy.get('[data-cy="signup-confirm-password"]').type("Password123!")
    cy.get('[data-cy="signup-submit"]').click()
    cy.location("pathname").should("match", /^\/dashboard\/pages\//)
    cy.get('[data-cy="page-title"]').should("be.visible")
  })

  it("opens, filters and applies slash commands by keyboard and mouse", () => {
    firstBlock().click().type("/")
    firstBlock()
      .should("be.focused")
      .then(($block) => {
        const selection = $block[0].ownerDocument.getSelection()
        expect(selection?.focusOffset).to.equal(1)
      })
    cy.contains("button", "Texto").should("be.visible")
    cy.contains("button", "Imagem").should("exist")

    firstBlock().type("{esc}").should("have.text", "/")
    cy.contains("button", "Texto").should("not.exist")

    firstBlock().clear().type("/title")
    cy.contains("button", "Título 1").should("be.visible")
    cy.contains("button", "Título 3").should("be.visible")
    firstBlock().type("{downarrow}{enter}")
    cy.get('[data-block-type="heading2"] [contenteditable="true"]')
      .first()
      .should("have.text", "")

    firstBlock().type("/block")
    cy.contains("button", "Texto").should("be.visible")
    cy.contains("button", "Imagem").should("exist")
    cy.contains("button", "Citação").click()
    cy.get('[data-block-type="quote"] [contenteditable="true"]')
      .first()
      .should("have.text", "")
  })
})
