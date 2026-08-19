export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-admin-token",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const clientToken = request.headers.get("x-admin-token");
    if (clientToken !== env.ADMIN_TOKEN) return new Response(JSON.stringify({ error: "口令错误" }), { status: 401, headers: corsHeaders });

    // 1. App 专属图床
    if (url.pathname === "/api/app/upload" && request.method === "POST") {
      const fileName = url.searchParams.get("name");
      try {
        await env.R2_BUCKET.put(fileName, request.body);
        return new Response(JSON.stringify({ success: true, url: `https://img.koobai.com/${fileName}` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (error) { return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders }); }
    }

    // 🌟 2. 传入路径，精准获取单条 Markdown 详情（用于编辑）
    if (url.pathname === "/api/app/laodao/detail" && request.method === "GET") {
      try {
        const path = url.searchParams.get("path");
        if (!path) throw new Error("缺少文件路径");

        const fileRes = await fetch(`https://api.github.com/repos/koobai/blog/contents/${path}?ref=main`, {
          headers: { "Authorization": `Bearer ${env.GH_TOKEN}`, "User-Agent": "App-Worker" }
        });
        const fileData = await fileRes.json();
        if (!fileRes.ok) throw new Error(fileData.message || "找不到该文件");

        const rawText = decodeURIComponent(escape(atob(fileData.content.replace(/\n/g, ""))));

       // 🌟 增加 device 变量
        let content = rawText, date = null, locationName = "", lat = 0, lng = 0, device = null;
        if (rawText.startsWith("---")) {
          const parts = rawText.split("---");
          if (parts.length >= 3) {
            const frontmatter = parts[1];
            content = parts.slice(2).join("---").trim();
            const dateMatch = frontmatter.match(/date:\s*"?([^"\n]+)"?/);
            if (dateMatch) date = dateMatch[1].trim();
            const locMatch = frontmatter.match(/location:\s*"([^"]+)"/);
            if (locMatch) locationName = locMatch[1];
            const latlngMatch = frontmatter.match(/latlng:\s*"([^"]+)"/);
            if (latlngMatch) { const pts = latlngMatch[1].split(","); lat = parseFloat(pts[0]); lng = parseFloat(pts[1]); }

            // 🌟 提取 device 小尾巴
            const deviceMatch = frontmatter.match(/device:\s*"([^"]+)"/);
            if (deviceMatch) device = deviceMatch[1];
          }
        }
        return new Response(JSON.stringify({
          // 🌟 把 device 返回给客户端
          sha: fileData.sha, path: path, content, date, locationName, lat, lng, device
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders }); }
    }

    // 🌟 3. 传入路径，自动查 sha 并秒杀删除！
    if (url.pathname === "/api/app/laodao/delete" && request.method === "POST") {
      try {
        const body = await request.json();
        const path = body.path;
        if (!path) throw new Error("缺少路径");

        // 自动查出该文件的 sha
        const fileRes = await fetch(`https://api.github.com/repos/koobai/blog/contents/${path}?ref=main`, {
          headers: { "Authorization": `Bearer ${env.GH_TOKEN}`, "User-Agent": "App-Worker" }
        });
        if (!fileRes.ok) throw new Error("删除失败：找不到该文件");
        const sha = (await fileRes.json()).sha;

        // 携带 sha 进行删除
        const ghRes = await fetch(`https://api.github.com/repos/koobai/blog/contents/${path}`, {
          method: "DELETE",
          headers: { "Authorization": `Bearer ${env.GH_TOKEN}`, "User-Agent": "App-Worker", "Content-Type": "application/json" },
          body: JSON.stringify({ message: "删除唠叨 (iOS API)", sha: sha, branch: "main" })
        });
        if (!ghRes.ok) throw new Error("GitHub 删除失败");
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders }); }
    }

    // 4. 发布/更新唠叨
    if (url.pathname === "/api/app/laodao/publish" && request.method === "POST") {
      try {
        const body = await request.json();
        // 🌟 接收 device
        let { content, images, locationName, lat, lng, date, sha, path, device } = body;

        const tags = [...new Set(Array.from(content.matchAll(/#([^\s<.,!?'"，。！？]+)/g), m => m[1]))];
        let md = `---\ndate: ${date}\n`;
        if (tags.length) md += `laodaotags:\n${tags.map(t => `  - ${t}`).join('\n')}\n`;
        if (locationName) md += `location: "${locationName}"\nlatlng: "${lat},${lng}"\n`;

        // 🌟 如果接收到了 device 字段，写入 Markdown 头部
        if (device) md += `device: "${device}"\n`;

        md += `---\n\n${content}\n`;
        if (images && images.length) md += images.map(img => `\n![img](${img})`).join('');

        const base64Content = btoa(unescape(encodeURIComponent(md)));

        if (!path) {
          const d = new Date();
          const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
          const h = String(d.getHours()).padStart(2,'0'), min = String(d.getMinutes()).padStart(2,'0'), s = String(d.getSeconds()).padStart(2,'0');
          path = `content/laodao/${y}/${m}/${y}${m}${day}-${h}${min}${s}.md`;
        }

        const ghPayload = { message: sha ? "修改唠叨 (iOS API)" : "唠叨一下 (iOS API)", content: base64Content, branch: "main" };
        if (sha) ghPayload.sha = sha;

        const ghRes = await fetch(`https://api.github.com/repos/koobai/blog/contents/${path}`, {
          method: "PUT",
          headers: { "Authorization": `Bearer ${env.GH_TOKEN}`, "User-Agent": "App-Worker", "Content-Type": "application/json" },
          body: JSON.stringify(ghPayload)
        });

        if (!ghRes.ok) throw new Error("GitHub 更新失败");
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders }); }
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }
};
