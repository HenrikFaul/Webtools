import { NextResponse } from "next/server";
import type { AiMergeRequest, AiMergeResponse } from "@/types/branchMerger";

const SYSTEM_PROMPT = `Szenior szoftverarchitekt vagy. Kapsz két kódfájlt: egyet a 'main' branchből és egyet egy 'új' (feature) branchből. A feladatod, hogy a kettőt gyúrd egybe egyetlen funkcionális fájllá.

Prioritások:
1. A 'main' branchben lévő meglévő funkciók NEM törhetnek el — nincs regresszió.
2. Az új branchben lévő új funkciókat zökkenőmentesen integráld a meglévő logika köré.
3. Ha van ütközés (conflict), a main branch viselkedése legyen az elsődleges, de az új funkciót is illeszd be, ha lehetséges.
4. Tartsd meg az importokat, típusdefiníciókat, és exportokat mindkét verzióból.
5. A kód legyen tiszta, olvasható, és azonnal futtatható.

KRITIKUS: Csak a tiszta, összefésült forráskódot add vissza. Semmilyen markdown formázást, backtick-et, magyarázó szöveget, vagy megjegyzést NE adj hozzá. Kizárólag a nyers kód legyen a válaszban.`;

async function callOpenAI(mainContent: string, featureContent: string, relativePath: string): Promise<AiMergeResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY environment variable is not set.");

  const userPrompt = `Fájl: ${relativePath}

=== MAIN BRANCH VERZIÓ ===
${mainContent}
=== MAIN BRANCH VÉGE ===

=== FEATURE BRANCH VERZIÓ ===
${featureContent}
=== FEATURE BRANCH VÉGE ===

Kérlek, fésüld össze ezt a két verziót a fenti szabályok szerint. Csak a nyers kódot add vissza.`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: 16000
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorText.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { total_tokens?: number };
    model?: string;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from OpenAI.");

  // Strip any markdown code fences the model may have added despite instructions
  const cleaned = content
    .replace(/^```[\w]*\n?/gm, "")
    .replace(/\n?```$/gm, "")
    .trim();

  return {
    mergedContent: cleaned,
    model: data.model ?? "unknown",
    tokensUsed: data.usage?.total_tokens
  };
}

async function callAnthropic(mainContent: string, featureContent: string, relativePath: string): Promise<AiMergeResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable is not set.");

  const userPrompt = `Fájl: ${relativePath}

=== MAIN BRANCH VERZIÓ ===
${mainContent}
=== MAIN BRANCH VÉGE ===

=== FEATURE BRANCH VERZIÓ ===
${featureContent}
=== FEATURE BRANCH VÉGE ===

Kérlek, fésüld össze ezt a két verziót a fenti szabályok szerint. Csak a nyers kódot add vissza.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514",
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.1,
      max_tokens: 16000
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errorText.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
    model?: string;
  };

  const text = data.content?.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("Empty response from Anthropic.");

  const cleaned = text
    .replace(/^```[\w]*\n?/gm, "")
    .replace(/\n?```$/gm, "")
    .trim();

  return {
    mergedContent: cleaned,
    model: data.model ?? "unknown",
    tokensUsed: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0)
  };
}

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as AiMergeRequest;

    if (!payload.relativePath || !payload.mainContent || !payload.featureContent) {
      return NextResponse.json(
        { error: "relativePath, mainContent, and featureContent are all required." } as AiMergeResponse,
        { status: 400 }
      );
    }

    // Choose provider based on available env vars
    const provider = process.env.AI_MERGE_PROVIDER ?? (process.env.ANTHROPIC_API_KEY ? "anthropic" : "openai");

    let result: AiMergeResponse;
    if (provider === "anthropic") {
      result = await callAnthropic(payload.mainContent, payload.featureContent, payload.relativePath);
    } else {
      result = await callOpenAI(payload.mainContent, payload.featureContent, payload.relativePath);
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected AI merge error";
    return NextResponse.json({ error: message, mergedContent: "", model: "error" } as AiMergeResponse, { status: 500 });
  }
}
