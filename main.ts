import { Application, Router } from "https://deno.land/x/oak/mod.ts";

class UnlimitedAIClient {
  baseUrl = "https://unlimitedai.org";
  ajaxUrl = `${this.baseUrl}/wp-admin/admin-ajax.php`;
  commonHeaders: Record<string, string> = {
    "accept": "*/*",
    "accept-encoding": "gzip, deflate, br, zstd",
    "accept-language": "pt-BR,pt;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
    "cache-control": "no-cache",
    "content-type": "application/x-www-form-urlencoded",
    "origin": this.baseUrl,
    "pragma": "no-cache",
    "referer": `${this.baseUrl}/`,
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0"
  };

  wpnonce = "ed16d84167";
  postId = "18";
  chatbotIdentity = "shortcode";
  wpaicgChatClientId = "a5UlxWnSOp";
  defaultChatId = "a5UlxWnSOp";
  sessionId: string;
  chatHistory: Array<{ role: string; text: string }> = [];

  constructor(sessionId?: string) {
    // Gera um UUID se nenhum for fornecido.
    this.sessionId = sessionId ?? crypto.randomUUID();
  }

  setSession(sessionId: string) {
    this.sessionId = sessionId;
    this.chatHistory = [];
    console.info(`Sessão alterada: ${this.sessionId}`);
  }

  clearHistory() {
    this.chatHistory = [];
    console.info("Histórico de conversa limpo.");
  }

  async sendMessage(message: string): Promise<string> {
    // Adiciona a mensagem humana ao histórico.
    this.chatHistory.push({ role: "human", text: message });

    const payload = new URLSearchParams({
      "_wpnonce": this.wpnonce,
      "post_id": this.postId,
      "url": this.baseUrl,
      "action": "wpaicg_chat_shortcode_message",
      "message": message,
      "bot_id": "0",
      "chatbot_identity": this.chatbotIdentity,
      "wpaicg_chat_client_id": this.wpaicgChatClientId,
      "wpaicg_chat_history": JSON.stringify(this.chatHistory),
      "chat_id": this.defaultChatId,
    });

    try {
      const response = await fetch(this.ajaxUrl, {
        method: "POST",
        headers: this.commonHeaders,
        body: payload.toString(),
      });
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      const text = await response.text();
      const answer = this.extractResponseText(text);
      this.chatHistory.push({ role: "assistant", text: answer });
      return answer;
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
      return "Erro ao processar a resposta.";
    }
  }

  extractResponseText(responseText: string): string {
    const lines = responseText.split("\n");
    let message = "";
    for (const line of lines) {
      if (line.startsWith("data:")) {
        try {
          // Remove "data:" e converte o restante em JSON.
          const data = JSON.parse(line.substring(6));
          const delta = data.choices?.[0]?.delta;
          if (delta && delta.content) {
            message += delta.content;
          }
        } catch (_error) {
          continue;
        }
      }
    }
    return message.trim() || "Resposta não encontrada.";
  }
}

// Cria uma instância global do client. Para uma aplicação real, pode ser interessante gerenciar sessões separadas.
const client = new UnlimitedAIClient();

const router = new Router();

// Endpoint para enviar mensagem e obter resposta
router.post("/send", async (context) => {
  try {
    const { value } = await context.request.body({ type: "json" });
    const { message } = await value;
    if (!message) {
      context.response.status = 400;
      context.response.body = { error: "Mensagem não informada" };
      return;
    }
    const answer = await client.sendMessage(message);
    context.response.status = 200;
    context.response.body = { answer, session_id: client.sessionId };
  } catch (error) {
    console.error("Erro no endpoint /send:", error);
    context.response.status = 500;
    context.response.body = { error: "Erro interno" };
  }
});

// Endpoint para visualizar o histórico da sessão
router.get("/history", (context) => {
  context.response.status = 200;
  context.response.body = {
    session_id: client.sessionId,
    chat_history: client.chatHistory,
  };
});

const app = new Application();
app.use(router.routes());
app.use(router.allowedMethods());

await app.listen();
