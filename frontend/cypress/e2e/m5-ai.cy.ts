type Auth = { token: string; user: { id: string } }
type LoggedOperation = {
  seq: number
  actor_id: string
  operation: {
    type: string
    blockId?: string
    block?: { id: string; type: string; properties: { text?: string } }
  }
  group?: {
    group_id: string
    group_ordinal: number
    source: string
    initiated_by: string
  }
}
type OperationsPage = { operations: LoggedOperation[] }
type PageResponse = {
  page: { rootId: string; blocks: Array<{ id: string; content: string[] }> }
}

function firstParagraph<T extends HTMLElement>(
  subject: Cypress.Chainable<JQuery<T>>
) {
  return subject
    .find('[data-block-type="paragraph"] [contenteditable="true"]')
    .first()
}
function iframeBody() {
  return cy
    .get<HTMLIFrameElement>('[data-cy="m5-second-editor"]')
    .its("0.contentDocument.body")
    .should("not.be.empty")
    .then((body) => cy.wrap(body))
}
function observeSecondEditor() {
  iframeBody().then(($body) => {
    const document = $body[0].ownerDocument
    const window = document.defaultView as Window & {
      __m5ParagraphCounts?: number[]
      __m5PageSnapshots?: number
    }
    const count = () =>
      document.querySelectorAll('[data-block-type="paragraph"]').length
    window.__m5ParagraphCounts = [count()]
    window.__m5PageSnapshots = 0
    new MutationObserver(() => {
      const next = count()
      if (window.__m5ParagraphCounts?.at(-1) !== next)
        window.__m5ParagraphCounts?.push(next)
    }).observe(document.body, { childList: true, subtree: true })
    const nativeFetch = window.fetch.bind(window)
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : null
      const url = new URL(
        request?.url ?? input.toString(),
        window.location.href
      )
      const method = init?.method ?? request?.method ?? "GET"
      if (
        method === "GET" &&
        /\/workspaces\/[^/]+\/pages\/[^/]+$/.test(url.pathname)
      )
        window.__m5PageSnapshots = (window.__m5PageSnapshots ?? 0) + 1
      return nativeFetch(input, init)
    }
  })
}

describe("M5 real-provider collaborative AI", () => {
  it("streams exactly two AI blocks to a live collaborator and undoes them", () => {
    const email = `m5-ai-${Date.now()}@example.com`
    const seed = "Cypress seed: the team ships small, observable changes."
    const prompt =
      "Continue from the seed text. Insert exactly two short paragraph blocks, each under 12 words. Do not insert any other blocks."
    let seedSeq = 0
    let aiOperations: LoggedOperation[] = []
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
          cy.authenticatedVisitWithSocketTracker(path, auth.token)
          cy.window().then((window) =>
            cy.wrap(
              window.__cypressWorkspaceSocketTracker!.waitForInitialCatchUp()
            )
          )
          cy.get('[data-cy="page-title"]').should("be.visible")
          cy.window().then((window) =>
            cy
              .wrap(window.__cypressWorkspaceSocketTracker!.cursor)
              .as("beforeSeedCursor")
          )
          firstParagraph(cy.get("body")).click().type(seed)
          cy.get('[data-cy="save-state"]').should(
            "have.attr",
            "data-state",
            "saved"
          )
          cy.get<number>("@beforeSeedCursor").then((cursor) =>
            cy
              .window()
              .then((window) =>
                cy.wrap(
                  window.__cypressWorkspaceSocketTracker!.waitForCursorAbove(
                    cursor
                  )
                )
              )
          )
          cy.window().then((window) => {
            seedSeq = window.__cypressWorkspaceSocketTracker!.cursor
          })
          cy.get('[data-block-type="paragraph"]').first().as("seedBlock")
          cy.get("@seedBlock").invoke("attr", "data-block-id").as("seedBlockId")
          cy.document().then((document) => {
            const iframe = document.createElement("iframe")
            iframe.dataset.cy = "m5-second-editor"
            iframe.src = path
            document.body.append(iframe)
          })
          iframeBody().find('[data-cy="page-title"]').should("be.visible")
          firstParagraph(iframeBody()).should("have.text", seed)
          observeSecondEditor()
          cy.get("@seedBlock").then(($block) => {
            const rect = $block[0].getBoundingClientRect()
            $block[0].dispatchEvent(
              new MouseEvent("contextmenu", {
                bubbles: true,
                cancelable: true,
                button: 2,
                clientX: rect.left + 20,
                clientY: rect.top + 10,
              })
            )
          })
          cy.get('[data-cy="block-menu-ai-continue"]').click()
          cy.get('[role="dialog"][aria-label="Reason AI"]', { timeout: 10_000 })
            .should("be.visible")
            .find('[aria-label="Message to Reason AI"]')
            .clear()
            .type(prompt)
          cy.contains("button", "Send").click()
          cy.contains("button", "Stop display", {
            timeout: 10_000,
          }).should("be.visible")
          iframeBody()
            .find('[data-block-type="paragraph"]', { timeout: 65_000 })
            .should("have.length", 3)
          cy.contains("button", "Stop display", {
            timeout: 65_000,
          }).should("not.exist")
          cy.get('[role="alert"]').should("not.exist")
          cy.get('[data-block-type="paragraph"]').should("have.length", 3)
          cy.then(() => {
            cy.api<OperationsPage>(
              "GET",
              `/workspaces/${workspaceId}/operations`,
              { token: auth.token, qs: { after_seq: seedSeq } }
            ).then((response) => {
              aiOperations = response.body.operations.filter(
                (operation) => operation.group?.source === "ai"
              )
              expect(aiOperations).to.have.length(2)
              expect(aiOperations.map((operation) => operation.seq)).to.deep.eq(
                [seedSeq + 1, seedSeq + 2]
              )
              expect(
                aiOperations.map((operation) => operation.operation.type)
              ).to.deep.eq(["insert_block", "insert_block"])
              expect(
                aiOperations.map((operation) => operation.actor_id)
              ).to.deep.eq([auth.user.id, auth.user.id])
              expect(
                aiOperations.map((operation) => operation.group?.initiated_by)
              ).to.deep.eq([auth.user.id, auth.user.id])
              expect(
                new Set(
                  aiOperations.map((operation) => operation.group?.group_id)
                )
              ).to.have.length(1)
              expect(
                aiOperations.map((operation) => operation.group?.group_ordinal)
              ).to.deep.eq([0, 1])
              aiOperations.forEach((operation) => {
                expect(operation.operation.block?.type).to.eq("paragraph")
                const text = operation.operation.block?.properties.text
                expect(text).to.be.a("string")
                expect(text).not.to.eq("")
                expect(text!.split(/\s+/)).to.have.length.at.most(12)
              })
            })
          })
          iframeBody().then(($body) => {
            const iframeWindow = $body[0].ownerDocument
              .defaultView as Window & { __m5ParagraphCounts?: number[] }
            expect(iframeWindow.__m5ParagraphCounts).to.include.members([
              1, 2, 3,
            ])
          })
          cy.get('[aria-label="Close Reason AI"]').click()
          firstParagraph(cy.get("body")).click().type("{ctrl}z")
          cy.get('[data-block-type="paragraph"]').should("have.length", 1)
          iframeBody()
            .find('[data-block-type="paragraph"]')
            .should("have.length", 1)
          cy.get('[data-cy="save-state"]').should(
            "have.attr",
            "data-state",
            "saved"
          )
          cy.then(() => {
            cy.api<OperationsPage>(
              "GET",
              `/workspaces/${workspaceId}/operations`,
              { token: auth.token, qs: { after_seq: seedSeq + 2 } }
            ).then((response) => {
              const inverse = response.body.operations
              expect(inverse).to.have.length(2)
              expect(
                inverse.map((operation) => operation.operation.type)
              ).to.deep.eq(["delete_block", "delete_block"])
              expect(inverse.map((operation) => operation.actor_id)).to.deep.eq(
                [auth.user.id, auth.user.id]
              )
              expect(
                inverse.map((operation) => operation.operation.blockId)
              ).to.deep.eq(
                aiOperations
                  .map((operation) => operation.operation.block!.id)
                  .reverse()
              )
            })
          })
          cy.api<PageResponse>(
            "GET",
            `/workspaces/${workspaceId}/pages/${pageId}`,
            { token: auth.token }
          ).then((page) => {
            cy.get<string>("@seedBlockId").then((seedBlockId) => {
              const root = page.body.page.blocks.find(
                (block) => block.id === page.body.page.rootId
              )!
              expect(root.content).to.deep.eq([seedBlockId])
              expect(
                page.body.page.blocks.map((block) => block.id)
              ).not.to.include.members(
                aiOperations.map((operation) => operation.operation.block!.id)
              )
            })
          })
          cy.window().should((window) =>
            expect(window.__cypressWorkspaceSocketTracker!.pageLoads).to.eq(1)
          )
          iframeBody().then(($body) => {
            const iframeWindow = $body[0].ownerDocument
              .defaultView as Window & { __m5PageSnapshots?: number }
            expect(iframeWindow.__m5PageSnapshots).to.eq(0)
          })
        })
      })
    })
  })
})

export {}
