type Auth = { token: string }

type PageResponse = {
  page: {
    rootId: string
    blocks: Array<{ id: string; propVersions?: Record<string, number> }>
  }
}

function uniqueOpId(offset = 0) {
  const suffix = (Date.now() + offset).toString(16).padStart(12, "0")
  return `00000000-0000-4000-8000-${suffix}`
}

function saved<T extends HTMLElement>(subject: Cypress.Chainable<JQuery<T>>) {
  return subject
    .find('[data-cy="save-state"]')
    .should("have.attr", "data-state", "saved")
}

function firstBlock<T extends HTMLElement>(
  subject: Cypress.Chainable<JQuery<T>>
) {
  return subject
    .find('[data-block-type="paragraph"] [contenteditable="true"]')
    .first()
}

function iframeBody() {
  return cy
    .get<HTMLIFrameElement>('[data-cy="m3-second-editor"]')
    .its("0.contentDocument.body")
    .should("not.be.empty")
    .then((body) => cy.wrap(body))
}

function mountSecondEditor(path: string) {
  cy.document().then((document) => {
    const iframe = document.createElement("iframe")
    iframe.dataset.cy = "m3-second-editor"
    iframe.src = path
    document.body.append(iframe)
  })
}

describe("M3 real-time sync", () => {
  it("converges interleaved writes from two running EditorPage clients", () => {
    const email = `m3-converge-${Date.now()}@example.com`
    const localText = "escrita da sessão A"
    const remoteTitle = "título da sessão B"
    const finalTitle = "título da sessão B + sessão A"

    cy.signupByApi(email).then((auth: Auth) => {
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
          const path = `/dashboard/pages/${pageId}`
          cy.authenticatedVisit(path, auth.token)
          cy.get('[data-cy="page-title"]').should("be.visible")
          mountSecondEditor(path)
          iframeBody().find('[data-cy="page-title"]').should("be.visible")

          firstBlock(cy.get("body")).click().type(localText)
          saved(cy.get("body"))
          firstBlock(iframeBody()).should("have.text", localText)

          iframeBody()
            .find('[data-cy="page-title"]')
            .click()
            .type(`{selectall}${remoteTitle}`)
          saved(iframeBody())
          cy.get('[data-cy="page-title"]').should("have.text", remoteTitle)

          cy.get('[data-cy="page-title"]').click().type("{end} + sessão A")
          saved(cy.get("body"))
          cy.get('[data-cy="page-title"]').should("have.text", finalTitle)
          firstBlock(cy.get("body")).should("have.text", localText)
          iframeBody()
            .find('[data-cy="page-title"]')
            .should("have.text", finalTitle)
          firstBlock(iframeBody()).should("have.text", localText)
        })
      })
    })
  })

  it("recovers a contiguous frozen operation range after a blocked reconnect without a page reload", () => {
    const email = `m3-recover-${Date.now()}@example.com`
    const preservedText = "não perder antes da desconexão"
    const recoveredTitle = "recuperado do cursor"
    const recoveredIcon = "🚀"

    cy.signupByApi(email).then((auth: Auth) => {
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
          cy.api<PageResponse>(
            "GET",
            `/workspaces/${workspaceId}/pages/${pageId}`,
            { token: auth.token }
          ).then((page) => {
            const rootId = page.body.page.rootId
            const root = page.body.page.blocks.find(
              (block) => block.id === rootId
            )!
            cy.authenticatedVisitWithSocketTracker(
              `/dashboard/pages/${pageId}`,
              auth.token
            )
            cy.window().then((win) =>
              cy.wrap(
                win.__cypressWorkspaceSocketTracker!.waitForInitialCatchUp()
              )
            )
            cy.get('[data-cy="page-title"]').should("be.visible")
            cy.window().then((win) =>
              cy
                .wrap(win.__cypressWorkspaceSocketTracker!.cursor)
                .as("initialCursor")
            )

            firstBlock(cy.get("body")).click().type(preservedText)
            saved(cy.get("body"))
            cy.get<number>("@initialCursor").then((initialCursor) => {
              cy.window().then((win) =>
                cy.wrap(
                  win.__cypressWorkspaceSocketTracker!.waitForCursorAbove(
                    initialCursor
                  )
                )
              )
            })
            cy.window().then((win) => {
              const tracker = win.__cypressWorkspaceSocketTracker!
              expect(tracker.cursor).to.be.greaterThan(0)
              cy.wrap(tracker.cursor).as("priorCursor")
              tracker.blockConnections()
              return cy
                .wrap(tracker.closeOpenSockets())
                .then(() => cy.wrap(tracker.waitForBlockedAttempt()))
            })

            cy.api<{ seq: number }>(
              "POST",
              `/workspaces/${workspaceId}/operations`,
              {
                token: auth.token,
                body: {
                  type: "update_block",
                  opId: uniqueOpId(1),
                  blockId: rootId,
                  properties: { title: recoveredTitle },
                  propVersions: { title: (root.propVersions?.title ?? 0) + 1 },
                },
              }
            )
              .its("status")
              .should("eq", 200)
            cy.api<{ seq: number }>(
              "POST",
              `/workspaces/${workspaceId}/operations`,
              {
                token: auth.token,
                body: {
                  type: "update_block",
                  opId: uniqueOpId(2),
                  blockId: rootId,
                  properties: { icon: recoveredIcon },
                  propVersions: { icon: (root.propVersions?.icon ?? 0) + 1 },
                },
              }
            )
              .its("status")
              .should("eq", 200)

            cy.window().then((win) =>
              win.__cypressWorkspaceSocketTracker!.allowConnections()
            )
            cy.get<number>("@priorCursor").then((priorCursor) => {
              cy.window().then((win) =>
                cy.wrap(
                  win.__cypressWorkspaceSocketTracker!.waitForCatchUpAfter(
                    priorCursor
                  )
                )
              )
            })
            cy.get('[data-cy="page-title"]').should("have.text", recoveredTitle)
            cy.get('[data-cy="page-icon-trigger"]').should(
              "have.text",
              recoveredIcon
            )
            firstBlock(cy.get("body")).should("have.text", preservedText)

            cy.get<number>("@priorCursor").then((priorCursor) => {
              cy.window().should((win) => {
                const tracker = win.__cypressWorkspaceSocketTracker!
                const recovery = tracker.catchUpsAfter(priorCursor)
                expect(recovery.length).to.be.greaterThan(0)
                const frozenLatestSeq = recovery[0].latestSeq
                expect(recovery[0].afterSeq).to.eq(priorCursor)
                expect(
                  recovery.flatMap((page) =>
                    page.operations.map((operation) => operation.seq)
                  )
                ).to.deep.eq(
                  Cypress._.range(priorCursor + 1, frozenLatestSeq + 1)
                )
                expect(
                  recovery.every((page) => page.latestSeq === frozenLatestSeq)
                ).to.eq(true)
                expect(
                  recovery
                    .slice(1)
                    .every((page) => page.upToSeq === frozenLatestSeq)
                ).to.eq(true)
                expect(tracker.cursor).to.be.at.least(frozenLatestSeq)
                expect(tracker.pageLoads).to.eq(1)
              })
            })
          })
        })
      })
    })
  })
})

export {}
