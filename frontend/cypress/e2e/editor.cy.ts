// Regressão: digitação em ordem (o bug do texto invertido vinha do React
// reescrevendo o text node do contenteditable a cada keystroke), split com
// Enter e undo coalescido. A partir do M2, tudo isso atravessa o servidor.
describe("block editor", () => {
  function firstBlock() {
    return cy
      .get('[data-block-type="paragraph"] [contenteditable="true"]')
      .first()
  }

  /** Espera a fila de operações esvaziar. */
  function saved() {
    return cy
      .get('[data-cy="save-state"]')
      .should("have.attr", "data-state", "saved")
  }

  function openBlockContextMenu(editable: HTMLElement) {
    editable.ownerDocument.getSelection()?.removeAllRanges()
    return cy
      .wrap(editable)
      .then(($editable) => {
        const target = $editable[0]
        target.dispatchEvent(
          new PointerEvent("pointerdown", {
            bubbles: true,
            pointerId: 9,
            pointerType: "mouse",
            button: 2,
            buttons: 2,
          })
        )
        target.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            button: 2,
            buttons: 2,
          })
        )
      })
  }

  beforeEach(() => {
    const id = Date.now()
    cy.visit("/signup")
    cy.get('[data-cy="signup-display-name"]').type("Editor Teste")
    cy.get('[data-cy="signup-email"]').type(`editor-${id}@example.com`)
    cy.get('[data-cy="signup-password"]').type("Password123!")
    cy.get('[data-cy="signup-confirm-password"]').type("Password123!")
    cy.get('[data-cy="signup-submit"]').click()
    cy.location("pathname").should("match", /^\/dashboard\/pages\//)
    cy.get('[data-cy="page-title"]').should("be.visible")
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

    // Undo coalescido: a rajada "segunda linha" desfaz num passo só...
    cy.get("body").type("{meta}z")
    cy.get('[data-block-type="paragraph"]').should("have.length", 2)
    cy.get('[data-block-type="paragraph"] [contenteditable="true"]')
      .eq(1)
      .should("have.text", "")

    // ...e o passo seguinte desfaz o split que criou o bloco.
    cy.get("body").type("{meta}z")
    cy.get('[data-block-type="paragraph"]').should("have.length", 1)
    firstBlock().should("have.text", "Teste de digitação")
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

  it("persists title and blocks across a reload", () => {
    cy.get('[data-cy="page-title"]').click().type("Notas de lançamento")
    firstBlock().click().type("Toda edição é uma operação.")
    firstBlock().type("{enter}Segundo bloco")
    saved()

    cy.reload()

    cy.get('[data-cy="page-title"]').should("have.text", "Notas de lançamento")
    cy.get('[data-block-type="paragraph"]')
      .eq(0)
      .should("have.text", "Toda edição é uma operação.")
    cy.get('[data-block-type="paragraph"]')
      .eq(1)
      .should("have.text", "Segundo bloco")
    cy.get('[data-cy="breadcrumb-current"]').should(
      "contain.text",
      "Notas de lançamento"
    )
  })

  it("debounces rapid text edits and character deletion", () => {
    const textUpdates: unknown[] = []
    cy.intercept("POST", "**/operations", (request) => {
      const body = request.body as {
        type?: string
        properties?: { text?: string }
      }
      if (body.type === "update_block" && "text" in (body.properties ?? {})) {
        textUpdates.push(body)
      }
    })

    firstBlock().click().type("debounced-value", { delay: 0 })
    firstBlock().should("have.text", "debounced-value")
    cy.wait(500).then(() => {
      expect(textUpdates).to.have.length(1)
      expect(textUpdates[0]).to.have.nested.property(
        "properties.text",
        "debounced-value"
      )
    })

    firstBlock().type("{backspace}{backspace}{backspace}{backspace}", {
      delay: 0,
    })
    cy.wait(500).then(() => {
      expect(textUpdates).to.have.length(2)
      expect(textUpdates[1]).to.have.nested.property(
        "properties.text",
        "debounced-v"
      )
    })
  })

  it("keeps a marquee selection through Chromium focus and duplicates both blocks", () => {
    firstBlock().click().type("Alpha{enter}Bravo{enter}Charlie")
    saved()

    cy.get('[data-block-id]').then(($rows) => {
      const first = $rows[0].getBoundingClientRect()
      const second = $rows[1].getBoundingClientRect()
      cy.get<HTMLElement>('[data-cy="block-editor"]').then(($editor) => {
        const editor = $editor[0]
        editor.setPointerCapture = () => {}
        editor.releasePointerCapture = () => {}
        editor.hasPointerCapture = () => true
        editor.dispatchEvent(
          new PointerEvent("pointerdown", {
            bubbles: true,
            pointerId: 7,
            pointerType: "mouse",
            button: 0,
            clientX: first.left - 12,
            clientY: first.top - 4,
          })
        )
        editor.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            pointerId: 7,
            pointerType: "mouse",
            buttons: 1,
            clientX: first.right + 8,
            clientY: second.bottom + 4,
          })
        )
      })
      cy.get('[data-cy="block-selection-marquee"]').should("be.visible")
      cy.get<HTMLElement>('[data-cy="block-editor"]').then(($editor) => {
        $editor[0].dispatchEvent(
          new PointerEvent("pointerup", {
            bubbles: true,
            pointerId: 7,
            pointerType: "mouse",
          })
        )
      })
    })

    cy.get('[data-block-id]').then(($rows) => {
      const selected = [...$rows].filter((row) =>
        row.classList.contains("bg-primary/15")
      )
      expect(selected).to.have.length(2)
      return openBlockContextMenu(
        selected[0].querySelector<HTMLElement>('[contenteditable="true"]')!
      )
    })
    cy.contains("2 blocos selecionados").should("be.visible")
    cy.contains("Duplicar").should("be.visible")
    cy.contains("Transformar em").should("be.visible")
    cy.contains("Duplicar").click()
    cy.get('[data-block-id] [contenteditable="true"]').should(($editables) => {
      expect([...$editables].map((editable) => editable.textContent)).to.deep.equal([
        "Alpha",
        "Alpha",
        "Bravo",
        "Bravo",
        "Charlie",
      ])
    })
    saved()
    cy.reload()
    cy.get('[data-block-id]').then(($rows) => {
      const first = $rows[0].getBoundingClientRect()
      const second = $rows[1].getBoundingClientRect()
      cy.get<HTMLElement>('[data-cy="block-editor"]').then(($editor) => {
        const editor = $editor[0]
        editor.setPointerCapture = () => {}
        editor.releasePointerCapture = () => {}
        editor.hasPointerCapture = () => true
        editor.dispatchEvent(
          new PointerEvent("pointerdown", {
            bubbles: true,
            pointerId: 11,
            pointerType: "mouse",
            button: 0,
            clientX: first.left - 12,
            clientY: first.top - 4,
          })
        )
        editor.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            pointerId: 11,
            pointerType: "mouse",
            buttons: 1,
            clientX: first.right + 8,
            clientY: second.bottom + 4,
          })
        )
      })
      cy.get('[data-cy="block-selection-marquee"]').should("be.visible")
      cy.get<HTMLElement>('[data-cy="block-editor"]').then(($editor) => {
        $editor[0].dispatchEvent(
          new PointerEvent("pointerup", {
            bubbles: true,
            pointerId: 11,
            pointerType: "mouse",
          })
        )
      })
    })
    cy.get('[data-block-id].bg-primary\\/15').should("have.length", 2)
    cy.get('[data-block-id].bg-primary\\/15').then(($selected) => {
      return openBlockContextMenu(
        $selected[0].querySelector<HTMLElement>('[contenteditable="true"]')!
      )
    })
    cy.contains("2 blocos selecionados").should("be.visible")
    cy.get<HTMLElement>('[data-cy="block-context-menu"]').then(($menu) => {
      $menu[0].dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true,
          cancelable: true,
        })
      )
    })
    cy.get('[data-cy="block-context-menu"]').should("not.exist")
    cy.get('[data-block-id].bg-primary\\/15').should("have.length", 2)
  })

  it("creates a nested page, navigates by breadcrumb, and persists its content", () => {
    cy.get('[data-cy="page-title"]').click().type("Pai")
    cy.get('[data-cy="page-title"]').blur()
    saved()

    cy.location("pathname").then((parentPath) => {
      const parentId = parentPath.split("/").pop()!
      // O `+` da linha cria uma sub-página; o do cabeçalho cria uma de topo.
      cy.get(`[data-cy="nav-page-plus-${parentId}"]`).click({ force: true })
      cy.location("pathname").should("not.eq", parentPath)

      cy.get('[data-cy="page-title"]').click().type("Filha")
      firstBlock().click().type("corpo da filha")
      saved()

      cy.reload()
      cy.get('[data-cy="page-title"]').should("have.text", "Filha")
      firstBlock().should("have.text", "corpo da filha")

      cy.get('[data-cy="breadcrumb-current"]').should("contain.text", "Filha")
      cy.get('[data-cy^="breadcrumb-"]')
        .not('[data-cy="breadcrumb-current"]')
        .click()
      cy.location("pathname").should("eq", parentPath)

      // Na página pai, a filha é um link — nunca conteúdo expandido.
      cy.get('[data-cy^="page-link-"]').should("contain.text", "Filha")
      cy.contains("corpo da filha").should("not.exist")
      cy.get('[data-cy^="page-link-"]').click()
      cy.get('[data-cy="page-title"]').should("have.text", "Filha")
    })
  })

  it("sets an emoji icon and shows it in the sidebar and breadcrumb", () => {
    cy.get('[data-cy="page-title"]').click().type("Lançamento")
    cy.get('[data-cy="page-title"]').blur()

    cy.get('[data-cy="page-icon-trigger"]').should("have.text", "📄").click()
    cy.get('[data-cy="page-icon-option-🚀"]').click()
    cy.get('[data-cy="page-icon-trigger"]').should("have.text", "🚀")
    saved()

    cy.location("pathname").then((path) => {
      const pageId = path.split("/").pop()!
      cy.get(`[data-cy="nav-page-${pageId}"]`).should("contain.text", "🚀")
    })
    cy.get('[data-cy="breadcrumb-current"]').should("contain.text", "🚀")

    cy.reload()
    cy.get('[data-cy="page-icon-trigger"]').should("have.text", "🚀")

    cy.get('[data-cy="page-icon-trigger"]').click()
    cy.get('[data-cy="page-icon-remove"]').click()
    cy.get('[data-cy="page-icon-trigger"]').should("have.text", "📄")
  })

  it("renames and trashes a page from the sidebar context menu", () => {
    cy.location("pathname").then((rootPath) => {
      const rootId = rootPath.split("/").pop()!

      // O `+` do cabeçalho cria uma página de TOPO, irmã da primeira.
      cy.get('[data-cy="nav-pages-create"]').click()
      // O router só troca depois que as duas insert_block são aceitas.
      cy.location("pathname").should("not.eq", rootPath)

      // Toda página visível tem o container como pai, então todas são deletáveis.
      cy.get(`[data-cy="nav-page-${rootId}"]`).rightclick()
      cy.get('[data-cy="nav-page-rename"]').should("be.visible")
      cy.get('[data-cy="nav-page-delete"]').should("be.visible")
      cy.get("body").type("{esc}")

      cy.location("pathname").then((siblingPath) => {
        const childId = siblingPath.split("/").pop()!

        cy.get(`[data-cy="nav-page-${childId}"]`).rightclick()
        cy.get('[data-cy="nav-page-rename"]').click()
        cy.get('[data-cy="rename-page-input"]')
          .should("be.focused")
          .type("Renomeada")
        cy.get('[data-cy="rename-page-submit"]').click()

        cy.get(`[data-cy="nav-page-${childId}"]`).should("contain.text", "Renomeada")
        cy.get('[data-cy="page-title"]').should("have.text", "Renomeada")

        cy.get(`[data-cy="nav-page-${childId}"]`).rightclick()
        cy.get('[data-cy="nav-page-delete"]').click()

        // A página aberta foi para o lixo: volta para a raiz e some da sidebar.
        cy.location("pathname").should("eq", rootPath)
        cy.get(`[data-cy="nav-page-${childId}"]`).should("not.exist")

        cy.get('[data-cy="trash-trigger"]').click()
        cy.get(`[data-cy="trash-entry-${childId}"]`).should("contain.text", "Renomeada")
      })
    })
  })

  it("the header + creates a top-level page, not a child", () => {
    cy.get('[data-cy="page-title"]').click().type("Primeira")
    cy.get('[data-cy="page-title"]').blur()
    saved()

    cy.location("pathname").then((firstPath) => {
      const firstId = firstPath.split("/").pop()!

      cy.get('[data-cy="nav-pages-create"]').click()
      cy.location("pathname").should("not.eq", firstPath)
      cy.get('[data-cy="page-title"]').click().type("Segunda")
      cy.get('[data-cy="page-title"]').blur()
      saved()

      // Irmãs: nenhuma é filha da outra. A primeira não vira link dentro da segunda,
      // e o breadcrumb da segunda tem só ela.
      cy.get('[data-cy="breadcrumb-current"]').should("contain.text", "Segunda")
      cy.get('[data-cy^="breadcrumb-"]')
        .not('[data-cy="breadcrumb-current"]')
        .should("not.exist")

      cy.get(`[data-cy="nav-page-${firstId}"]`).should("contain.text", "Primeira")
      cy.get(`[data-cy="nav-page-${firstId}"]`).click()
      cy.get('[data-cy="page-title"]').should("have.text", "Primeira")
      cy.get('[data-cy^="page-link-"]').should("not.exist")
    })
  })

  it("trashes a block subtree and restores it with its children", () => {
    // Monta pai > filho > neto. Cypress não digita Tab: disparamos o keydown.
    const blocks = () =>
      cy.get('[data-block-type="paragraph"] [contenteditable="true"]')
    const indent = (index: number) =>
      blocks().eq(index).trigger("keydown", { key: "Tab" })

    firstBlock().click().type("pai")
    firstBlock().type("{enter}filho")
    indent(1)
    blocks().eq(1).type("{enter}neto")
    indent(2)
    cy.get('[data-block-type="paragraph"]').should("have.length", 3)
    saved()

    // Backspace no início de "filho" funde o texto no pai e manda a subárvore
    // (filho + neto) para o lixo numa única `delete_block`.
    blocks()
      .eq(1)
      .type("{leftarrow}{leftarrow}{leftarrow}{leftarrow}{leftarrow}{backspace}")
    cy.get('[data-block-type="paragraph"]').should("have.length", 1)
    firstBlock().should("have.text", "paifilho")
    saved()

    cy.reload()
    cy.get('[data-block-type="paragraph"]').should("have.length", 1)

    cy.get('[data-cy="trash-trigger"]').click()
    cy.get('[data-cy="trash-dialog"]').should("be.visible")
    cy.get('[data-cy^="trash-entry-"]').should("have.length", 1).contains("filho")
    cy.get('[data-cy^="trash-restore-"]').click()
    cy.get('[data-cy^="trash-entry-"]').should("not.exist")

    // Restore devolve filho E neto, sem recarregar a página.
    cy.get('[data-cy="trash-dialog"]').type("{esc}")
    cy.get('[data-block-type="paragraph"]').should("have.length", 3)
    cy.contains("neto").should("be.visible")
  })
})

describe("workspace scoping", () => {
  it("refuses a page read from a workspace the user does not belong to", () => {
    const id = Date.now()
    cy.signupByApi(`owner-${id}@example.com`).then((owner) => {
      cy.api<Array<{ id: string }>>("GET", "/workspaces", {
        token: owner.token,
      }).then((workspaces) => {
        const workspaceId = workspaces.body[0].id
        cy.api<{ root_page_id: string }>(
          "GET",
          `/workspaces/${workspaceId}/pages`,
          { token: owner.token }
        ).then((pages) => {
          cy.signupByApi(`stranger-${id}@example.com`).then((stranger) => {
            cy.api(
              "GET",
              `/workspaces/${workspaceId}/pages/${pages.body.root_page_id}`,
              { token: stranger.token, failOnStatusCode: false }
            )
              .its("status")
              .should("eq", 403)

            cy.api("POST", `/workspaces/${workspaceId}/operations`, {
              token: stranger.token,
              failOnStatusCode: false,
              body: {
                type: "update_block",
                opId: "11111111-1111-4111-8111-111111111111",
                blockId: pages.body.root_page_id,
                properties: { title: "hack" },
              },
            })
              .its("status")
              .should("eq", 403)
          })
        })
      })
    })
  })
})
