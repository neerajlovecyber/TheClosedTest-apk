import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

const http = httpRouter();

http.route({
    path: "/share",
    method: "GET",
    handler: httpAction(async (ctx, request) => {
        const url = new URL(request.url);
        const appIdString = url.searchParams.get("appId");

        if (!appIdString) {
            return new Response("Missing appId", { status: 400 });
        }

        // specific hack for ID validation if needed or just try/catch
        let app;
        try {
            const appId = appIdString as Id<"apps">;
            app = await ctx.runQuery(api.apps.getAppArgs, { appId });
        } catch (e) {
            return new Response("Invalid App ID", { status: 400 });
        }

        if (!app) {
            return new Response("App not found", { status: 404 });
        }

        // Construct deep link
        const deepLink = `theclosedtest://app-details/${app._id}`;
        // Construct fallback URL (Play Store if available, else a generic page)
        const fallbackUrl = "https://play.google.com/store/apps/details?id=com.theneerajsec.theclosedtest";

        const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Check out ${app.title} on TheClosedTest</title>
        <meta property="og:title" content="Test ${app.title} on TheClosedTest" />
        <meta property="og:description" content="Help me test ${app.title} and earn reputation!" />
        <meta property="og:image" content="${app.iconUrl}" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #f0fdf4; color: #15803d; margin: 0; padding: 20px; text-align: center; }
          .card { background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); max-width: 400px; width: 100%; }
          img { width: 80px; height: 80px; border-radius: 16px; margin-bottom: 1rem; object-fit: cover; }
          h1 { margin: 0 0 0.5rem 0; color: #111; font-size: 1.5rem; }
          p { margin: 0 0 1.5rem 0; color: #666; line-height: 1.5; }
          .btn { display: inline-block; background: #16a34a; color: white; padding: 12px 24px; border-radius: 9999px; text-decoration: none; font-weight: bold; margin-bottom: 10px; width: 100%; box-sizing: border-box; }
          .btn-outline { background: transparent; border: 2px solid #16a34a; color: #16a34a; }
        </style>
      </head>
      <body>
        <div class="card">
            <img src="${app.iconUrl}" alt="${app.title}" />
            <h1>${app.title}</h1>
            <p>Join the closed testing for ${app.title} and swap tests with other developers.</p>
            <a href="${deepLink}" class="btn" id="open-btn">Open in TheClosedTest</a>
            <a href="${fallbackUrl}" class="btn btn-outline">Download App</a>
        </div>
        <script>
            // Try to open the app automatically
            window.onload = function() {
                var userAgent = navigator.userAgent || navigator.vendor || window.opera;
                // Only attempt auto-redirect on Android/iOS
                if (/android/i.test(userAgent) || /iPad|iPhone|iPod/.test(userAgent)) {
                    // document.getElementById('open-btn').click();
                    window.location.href = "${deepLink}";
                     // Set a fallback timeout to go to store if app doesn't open
                    setTimeout(function() {
                        // Optional: Redirect to store automatically?
                        // window.location.href = "${fallbackUrl}";
                    }, 500);
                }
            };
        </script>
      </body>
    </html>
    `;

        return new Response(html, {
            headers: { "content-type": "text/html" },
            status: 200,
        });
    }),
});

export default http;
