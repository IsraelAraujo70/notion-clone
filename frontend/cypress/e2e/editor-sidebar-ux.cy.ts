describe("editor and sidebar UX eval", () => {
  function saved() {
    return cy
      .get('[data-cy="save-state"]')
      .should("have.attr", "data-state", "saved")
  }

  function currentPageId() {
    return cy.location("pathname").then((path) => path.split("/").pop()!)
  }

  function createChild() {
    currentPageId().then((parentId) => {
      cy.get(`[data-cy="nav-page-plus-${parentId}"]`).click({ force: true })
      cy.location("pathname").should("not.match", new RegExp(`${parentId}$`))
    })
    cy.get('[data-cy="page-title"]').should("be.visible")
    saved()
  }

  beforeEach(() => {
    cy.viewport(1280, 900)
    const id = Date.now()
    cy.visit("/signup")
    cy.get('[data-cy="signup-display-name"]').type("UX Eval")
    cy.get('[data-cy="signup-email"]').type(`ux-${id}@example.com`)
    cy.get('[data-cy="signup-password"]').type("Password123!")
    cy.get('[data-cy="signup-confirm-password"]').type("Password123!")
    cy.get('[data-cy="signup-submit"]').click()
    cy.location("pathname").should("match", /^\/dashboard\/pages\//)
  })

  it("proves highlighted multiline code, a persisted rail, and legible deep titles", () => {
    cy.get('[data-block-type="paragraph"] [contenteditable="true"]')
      .first()
      .click()
      .type("/code{enter}")

    cy.get('[data-cy^="code-editor-"] .cm-content')
      .should("be.visible")
      .click()
      .type("const answer = 42{enter}const doubled = answer * 2{enter}return doubled{enter}// done")
    cy.get('[data-cy^="code-language-"]').click()
    cy.get('[data-cy="code-language-option-typescript"]').click()
    cy.get('[data-cy^="code-editor-"] .cm-line').should("have.length", 4)
    cy.get('[data-cy^="code-editor-"] .cm-line span').should("exist")
    saved()
    cy.screenshot("editor-sidebar-ux-light")

    cy.get('[data-cy="sidebar-rail"]')
      .trigger("pointerdown", { pointerId: 1, clientX: 240, button: 0 })
      .trigger("pointermove", { pointerId: 1, clientX: 360 })
      .trigger("pointerup", { pointerId: 1, clientX: 360 })
    cy.window().its("localStorage").invoke("getItem", "reason:sidebar-width:v1").should("eq", "360")

    cy.reload()
    cy.get('[data-cy^="code-editor-"] .cm-line').should("have.length", 4)
    cy.get('[data-cy^="code-editor-"] .cm-line span').should("exist")
    cy.get('[data-cy^="code-language-"]').should("contain.text", "TypeScript")
    cy.window().its("localStorage").invoke("getItem", "reason:sidebar-width:v1").should("eq", "360")

    cy.window().then((window) =>
      window.localStorage.setItem("reason:sidebar-width:v1", "240")
    )
    cy.reload()
    cy.get('[data-slot="sidebar-container"]').should("have.css", "width", "240px")

    for (let count = 0; count < 7; count += 1) {
      createChild()
    }

    currentPageId().then((deepestPageId) => {
      cy.get(`[data-cy="nav-page-title-${deepestPageId}"]`)
        .should("be.visible")
        .then(($title) => {
          expect($title[0].getBoundingClientRect().width).to.be.gte(96)
          expect($title.attr("title")).to.equal("Sem título")
        })
    })

    currentPageId().then((deepestPageId) => {
      cy.get(`[data-cy="nav-page-${deepestPageId}"]`).should("have.attr", "aria-label", "Sem título")
    })

    cy.get("body").click(1100, 780).type("d")
    cy.get("html").should("have.class", "dark")
    cy.screenshot("editor-sidebar-ux-dark")
  })
})
