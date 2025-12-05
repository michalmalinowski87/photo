Direct landing:

1. Gallery orders (main page)
2. Gallery photos (originals)
3. Gallery Settings
4. Order main page (photos)
5. Dashboard
6. Gallery list: Robocze
7. Settings
8. Wallet page
9. Order -> Gallery photos
10. Order -> Wallet
11. Create gallery -> Gallery view (does not load the ability to upload photos)
12. Publish gallery -> Pay through wallet
13. Publish gallery -> Pay through Stripe
14. Publish gallery -> popup wallet -> redirect back (we should see publish gallery)
16. Upload photos to the gallery (originals)
17. Upload final photos to the order
18. Load the publish gallery element:
19. Send link to client
20. Loading order view with photos and seleciton from user:
21. Delete gallery + dashboard redirect



Use the above data comprehensively as the front-end operations can be complex depending on the entry-point or previous state/page/action.

Pay attention to the loading state, overlays, next steps overlay.
Check of any weird overrides, workarounds and patching. Remove any redundant workload

This is because in the past we have a lot of sidebar functionalities that relied on the sub-component state. We no longer have this except for the top-bar bytes used. We also had a lot of optimistic updates with immediate response and we also no longer have this. Our process has been simplified greatly but the state did not.
For this reason we also have different states, caches (as workaround to patch network overcalls instead of fixing the underlying issues) and loading states that we may no longer need.

We also have some functionality that relies on the certain order statuses logic (ie. Delivery status etc.) this is currently computed on the front-end and I think we can reliably compute I on the back-end and only return the end result. Check for stuff like that and move it to the back-end. One example I can think of is the gallery status and because of that we pull all the orders for all the galleries to the state which is wasteful. We should only pull the gallery orders when loading the gallery page (that actually shows the orders) and some orders call with filter for the dashboard. This is just one of many examples so investigate deeply

The end goal is the fix the underlying problems not just patch around to make things work.
Do not remove the debuggers as we will need it to fix the functionality that breaks as the result of this refactoring.


Success criteria:
Single source of truths (depending on the resource)
Stable loading states
Stable global state (ie. Next steps overlay)
Stable transitions
Lack of state overriding and status flickering (causes the UI to flicker too)
Lack of weird state ie. We have data then null then data again (ie. for cache invalidation)
Excellent user experience (load only when we are ready to present the view)
No wasteful actions
No wasteful network calls
Simple, stable and easy to follow state flow
When we transition between pages after create gallery action we should see ful page loading overlay until we actually show the gallery page.