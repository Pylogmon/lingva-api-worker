import {
    getTranslationInfo,
    getTranslationText,
    getAudio,
    isValidCode,
    LanguageType,
    languageList,
    mapGoogleCode
} from "lingva-scraper";
import type { LangCode } from "lingva-scraper";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
};

const json = (body: unknown, status = 200): Response => (
    new Response(JSON.stringify(body), {
        status,
        headers: {
            ...corsHeaders,
            "Content-Type": "application/json; charset=utf-8"
        }
    })
);

const decodeSegment = (segment: string): string | null => {
    try {
        return decodeURIComponent(segment);
    } catch {
        return null;
    }
};

const toNumberArray = (audio: unknown): number[] | null => {
    if (!audio)
        return null;
    if (Array.isArray(audio))
        return audio;
    if (audio instanceof Uint8Array)
        return Array.from(audio);
    if (audio instanceof ArrayBuffer)
        return Array.from(new Uint8Array(audio));
    return null;
};

const parseBatchTranslation = (data: unknown): string | null => {
    const root = data as unknown[][][][][][][];
    const translation = root?.[1]?.[0]?.[0]?.[5]?.[0]?.[0] as unknown;

    return typeof translation === "string" && translation.trim()
        ? translation.trim()
        : null;
};

const getTranslationTextFallback = async (
    source: LangCode<"source">,
    target: LangCode<"target">,
    query: string
): Promise<string | null> => {
    const parsedSource = mapGoogleCode(source);
    const parsedTarget = mapGoogleCode(target);
    const reqData = JSON.stringify([[query, parsedSource, parsedTarget, true], [null]]);
    const reqBoilerplate = JSON.stringify([[["MkEWBc", reqData, null, "generic"]]]);
    const body = "f.req=" + encodeURIComponent(reqBoilerplate);
    const response = await fetch("https://translate.google.com/_/TranslateWebserverUi/data/batchexecute?rpcids=MkEWBc&rt=c", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0"
        },
        body
    });

    if (!response.ok)
        return null;

    const text = await response.text();
    const resBoilerplate = JSON.parse(text.split("\n")[3]);
    const resData = JSON.parse(resBoilerplate?.[0]?.[2]);

    return parseBatchTranslation(resData);
};

const getAudioFallback = async (
    target: LangCode<"target">,
    query: string
): Promise<ArrayBuffer | null> => {
    const url = new URL("https://translate.google.com/translate_tts");
    url.searchParams.set("ie", "UTF-8");
    url.searchParams.set("client", "tw-ob");
    url.searchParams.set("tl", mapGoogleCode(target));
    url.searchParams.set("q", query);

    const response = await fetch(url, {
        headers: {
            "Accept": "audio/mpeg,*/*",
            "Referer": "https://translate.google.com/",
            "User-Agent": "Mozilla/5.0"
        }
    });

    if (!response.ok)
        return null;

    const contentType = response.headers.get("Content-Type") ?? "";
    if (!contentType.toLowerCase().includes("audio"))
        return null;

    return response.arrayBuffer();
};

const handleLanguages = (segments: string[]): Response => {
    if (segments.length > 1)
        return json({ error: "Not Found" }, 404);

    const type = segments[0];

    if (type !== undefined && type !== "source" && type !== "target")
        return json({ error: "Type should be 'source', 'target' or empty" }, 400);

    const langEntries = Object.entries(languageList[type ?? "all"]) as [LangCode, string][];
    const languages = langEntries.map(([code, name]) => ({ code, name }));

    return json({ languages });
};

const handleTranslation = async (segments: string[]): Promise<Response> => {
    if (segments.length !== 3)
        return json({ error: "Not Found" }, 404);

    const [source, target, query] = segments;

    if (!isValidCode(target, LanguageType.TARGET))
        return json({ error: "Invalid target language" }, 400);

    if (source === "audio") {
        const audio = toNumberArray(await getAudio(target, query))
            ?? toNumberArray(await getAudioFallback(target, query));
        return audio
            ? json({ audio })
            : json({ error: "An error occurred while retrieving the audio" }, 500);
    }

    if (!isValidCode(source, LanguageType.SOURCE))
        return json({ error: "Invalid source language" }, 400);

    const translation = await getTranslationText(source, target, query)
        || await getTranslationTextFallback(source, target, query);

    if (!translation)
        return json({ error: "An error occurred while retrieving the translation" }, 500);

    const info = await getTranslationInfo(source, target, query);

    return info
        ? json({ translation, info })
        : json({ translation });
};

const handleApi = async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS")
        return new Response(null, { status: 204, headers: corsHeaders });

    if (request.method !== "GET")
        return json({ error: "Method Not Allowed" }, 405);

    const url = new URL(request.url);
    const rawSegments = url.pathname
        .replace(/^\/+|\/+$/g, "")
        .split("/")
        .filter(Boolean);

    if (rawSegments[0] !== "api" || rawSegments[1] !== "v1")
        return json({
            endpoints: [
                "/api/v1/:source/:target/:query",
                "/api/v1/audio/:lang/:query",
                "/api/v1/languages/:type?"
            ]
        });

    const segments = rawSegments.slice(2).map(decodeSegment);

    if (segments.some(segment => segment === null))
        return json({ error: "Invalid URL encoding" }, 400);

    const [resource, ...rest] = segments as string[];

    if (resource === "languages")
        return handleLanguages(rest);

    return handleTranslation([resource, ...rest]);
};

export default {
    async fetch(request: Request): Promise<Response> {
        try {
            return await handleApi(request);
        } catch (error) {
            return json({
                error: error instanceof Error
                    ? error.message
                    : "Internal Server Error"
            }, 500);
        }
    }
};
