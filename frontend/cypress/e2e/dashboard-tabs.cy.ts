type Workspace = { id: string }
type PageList = { pages: Array<{ id: string }> }

function pageIdFromPath(path: string) {
  return path.split("/").pop()!
}

function pageTabOrder() {
  return cy
    .get('[data-testid^="dashboard-tab-"]')
    .then(($tabs) => [...$tabs].map((tab) => tab.getAttribute("data-testid")))
}

describe("dashboard page tabs", () => {
  it("restores, reorders and closes desktop tabs without mounting inactive editors", () => {
    const id = Date.now()
    let pageSnapshotRequests = 0

    cy.intercept("GET", /\/workspaces\/[^/]+\/pages\/[^/?]+(?:\?.*)?$/, () => {
      pageSnapshotRequests += 1
    })

    cy.signupByApi(`tabs-${id}@example.com`).then(({ token }) => {
      cy.api<Workspace[]>("GET", "/workspaces", { token }).then((workspaces) => {
        const workspaceId = workspaces.body[0].id
        cy.api<PageList>("GET", `/workspaces/${workspaceId}/pages`, {
          token,
        }).then((pages) => {
          const firstPageId = pages.body.pages[0].id

          cy.authenticatedVisit("/dashboard", token)
          cy.location("pathname").should("eq", "/dashboard/ai")
          cy.get('[data-cy="dashboard-tab-ai"]').should("be.visible")
          cy.get('[data-cy="ai-workspace-page"]').should("be.visible")
          cy.window().then((window) => {
            const composer = window.document.querySelector(
              '[data-testid="ai-composer-overlay"]'
            )!
            expect(window.document.documentElement.scrollHeight).to.be.lte(
              window.innerHeight + 1
            )
            expect(
              Math.abs(composer.getBoundingClientRect().bottom - window.innerHeight)
            ).to.be.lessThan(2)
          })

          cy.get(`[data-cy="nav-page-${firstPageId}"]`).click()
          cy.location("pathname").should(
            "eq",
            `/dashboard/pages/${firstPageId}`
          )
          cy.get('[data-cy="page-content"]').should("have.length", 1)

          cy.get('[data-cy="nav-pages-create"]').click()
          cy.location("pathname").then((secondPath) => {
            const secondPageId = pageIdFromPath(secondPath)
            cy.get('[data-cy="nav-pages-create"]').click()
            cy.location("pathname").then((thirdPath) => {
              const thirdPageId = pageIdFromPath(thirdPath)
              const deepLink = `/dashboard/pages/${firstPageId}?block=deep-link-block`

              cy.visit(deepLink)
              cy.location("search").should("eq", "?block=deep-link-block")
              cy.get('[data-cy="page-content"]').should("have.length", 1)

              cy.window().then((win) => {
                const transfer = new win.DataTransfer()
                cy.get(`[data-cy="dashboard-tab-${thirdPageId}"]`).trigger(
                  "dragstart",
                  { dataTransfer: transfer }
                )
                cy.get(`[data-cy="dashboard-tab-${firstPageId}"]`)
                  .trigger("dragover", { dataTransfer: transfer })
                  .trigger("drop", { dataTransfer: transfer })
              })

              pageTabOrder().should("deep.equal", [
                `dashboard-tab-${thirdPageId}`,
                `dashboard-tab-${firstPageId}`,
                `dashboard-tab-${secondPageId}`,
              ])

              cy.then(() => {
                pageSnapshotRequests = 0
              })
              cy.reload()
              cy.location("pathname").should(
                "eq",
                `/dashboard/pages/${firstPageId}`
              )
              cy.location("search").should("eq", "?block=deep-link-block")
              pageTabOrder().should("deep.equal", [
                `dashboard-tab-${thirdPageId}`,
                `dashboard-tab-${firstPageId}`,
                `dashboard-tab-${secondPageId}`,
              ])
              cy.get('[data-cy="page-content"]').should("have.length", 1)
              cy.then(() => expect(pageSnapshotRequests).to.equal(1))

              cy.window().then((win) => {
                expect(
                  win.performance.getEntriesByName("reason:editor-mounted")
                ).to.have.length(1)
                expect(
                  win.performance.getEntriesByName("reason:page-ready")
                ).to.have.length(1)
              })

              cy.get(
                `[data-cy="dashboard-tab-close-${firstPageId}"]`
              ).click({ force: true })
              cy.location("pathname").should(
                "eq",
                `/dashboard/pages/${secondPageId}`
              )

              cy.get(
                `[data-cy="dashboard-tab-close-${secondPageId}"]`
              ).click({ force: true })
              cy.location("pathname").should(
                "eq",
                `/dashboard/pages/${thirdPageId}`
              )

              cy.get(
                `[data-cy="dashboard-tab-close-${thirdPageId}"]`
              ).click({ force: true })
              cy.location("pathname").should("eq", "/dashboard/ai")
              cy.get('[data-cy="ai-workspace-page"]').should("be.visible")
            })
          })
        })
      })
    })
  })

  it("sends a full-page workspace request without page context", () => {
    const id = Date.now()

    cy.signupByApi(`tabs-ai-${id}@example.com`).then(({ token }) => {
      cy.api<Workspace[]>("GET", "/workspaces", { token }).then((workspaces) => {
        const workspaceId = workspaces.body[0].id
        const conversation = {
          id: "conversation-tabs-eval",
          workspace_id: workspaceId,
          title: "",
          created_at: "2026-07-20T00:00:00Z",
          updated_at: "2026-07-20T00:00:00Z",
        }

        cy.intercept(
          "GET",
          `**/workspaces/${workspaceId}/ai/conversations`,
          []
        )
        cy.intercept(
          "POST",
          `**/workspaces/${workspaceId}/ai/conversations`,
          conversation
        )
        cy.intercept(
          "GET",
          `**/workspaces/${workspaceId}/ai/conversations/${conversation.id}/messages`,
          [
            {
              id: "message-tabs-eval",
              role: "assistant",
              content: "Workspace answer",
              created_at: "2026-07-20T00:00:01Z",
            },
          ]
        )
        cy.intercept(
          "POST",
          `**/workspaces/${workspaceId}/ai/actions/workspace_agent`,
          (request) => {
            expect(request.body).to.deep.include({
              prompt: "What changed in this workspace?",
              selection: [],
              mentionedPageIds: [],
            })
            expect(request.body).not.to.have.property("pageId")
            request.reply({
              headers: { "content-type": "text/event-stream" },
              body: [
                'data: {"type":"run_started","run_id":"run-tabs-eval"}',
                "",
                'data: {"type":"text_delta","delta":"Workspace answer"}',
                "",
                'data: {"type":"run_completed","run_id":"run-tabs-eval","message":{"id":"message-tabs-eval","role":"assistant","content":"Workspace answer","created_at":"2026-07-20T00:00:01Z"}}',
                "",
                "",
              ].join("\n"),
            })
          }
        ).as("workspaceAgent")

        cy.authenticatedVisit("/dashboard/ai", token)
        cy.get('[aria-label="Message to Reason AI"]').type(
          "What changed in this workspace?"
        )
        cy.get('[aria-label="Send"]').click()
        cy.wait("@workspaceAgent")
        cy.contains("Workspace answer").should("be.visible")
      })
    })
  })

  it("keeps the mobile web on the existing single-page navigation", () => {
    const id = Date.now()

    cy.viewport(375, 812)
    cy.signupByApi(`tabs-mobile-${id}@example.com`).then(({ token }) => {
      cy.authenticatedVisit("/dashboard/ai", token)
      cy.location("pathname").should("match", /^\/dashboard\/pages\//)
      cy.get('[role="tablist"]').should("not.exist")
      cy.get('[data-cy="page-title"]').should("be.visible")
    })
  })
})
