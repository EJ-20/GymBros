import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };
type ChatRole = 'user' | 'assistant' | 'system' | 'tool';

type RequestBody = {
  messages?: ChatMessage[];
  contextSummary?: string;
  threadId?: string;
  userMessage?: string;
};

type ToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

type OpenAIMessage = {
  role: ChatRole;
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

const TOOL_DEFS = [
  {
    type: 'function',
    function: {
      name: 'get_recent_sessions',
      description: 'Fetches the user’s most recent completed workout sessions and logged sets.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 12 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_exercise_progress',
      description:
        'Returns summary stats for a specific exercise (best set and recent trend) over the given time window.',
      parameters: {
        type: 'object',
        properties: {
          exercise_name: { type: 'string' },
          days: { type: 'integer', minimum: 7, maximum: 365 },
        },
        required: ['exercise_name'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_volume_trend',
      description: 'Returns weekly training volume trend for the given lookback window.',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'integer', minimum: 14, maximum: 365 },
        },
        additionalProperties: false,
      },
    },
  },
];

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function weekStartIso(dateLike: string): string {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return dateLike.slice(0, 10);
  const day = d.getUTCDay();
  const delta = day === 0 ? -6 : 1 - day; // monday start
  d.setUTCDate(d.getUTCDate() + delta);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

async function getRecentSessionsTool(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const limit = clamp(Number(args.limit ?? 5) || 5, 1, 12);
  const { data: sessions, error: sessionError } = await supabase
    .from('workout_sessions')
    .select('client_local_id, started_at, ended_at, notes, perceived_exertion')
    .eq('user_id', userId)
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: false })
    .limit(limit);

  if (sessionError) return { error: `session_query_failed: ${sessionError.message}` };
  const safeSessions = sessions ?? [];
  const sessionIds = safeSessions.map((s) => s.client_local_id);
  if (!sessionIds.length) return { sessions: [] };

  const [{ data: sets, error: setError }, { data: exercises, error: exError }] = await Promise.all([
    supabase
      .from('set_logs')
      .select('session_client_id, exercise_client_id, order_index, reps, weight_kg, duration_sec, distance_m, rpe')
      .eq('user_id', userId)
      .in('session_client_id', sessionIds)
      .order('order_index', { ascending: true }),
    supabase
      .from('exercises')
      .select('client_local_id, name')
      .eq('user_id', userId),
  ]);

  if (setError) return { error: `set_query_failed: ${setError.message}` };
  if (exError) return { error: `exercise_query_failed: ${exError.message}` };

  const exNameById = Object.fromEntries((exercises ?? []).map((e) => [e.client_local_id, e.name]));
  const setsBySession: Record<string, Record<string, unknown>[]> = {};
  for (const row of sets ?? []) {
    const sid = row.session_client_id;
    if (!setsBySession[sid]) setsBySession[sid] = [];
    setsBySession[sid]!.push({
      exercise: exNameById[row.exercise_client_id] ?? row.exercise_client_id,
      reps: row.reps,
      weightKg: row.weight_kg,
      durationSec: row.duration_sec,
      distanceM: row.distance_m,
      rpe: row.rpe,
    });
  }

  return {
    sessions: safeSessions.map((s) => ({
      sessionId: s.client_local_id,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      notes: s.notes,
      perceivedExertion: s.perceived_exertion,
      sets: setsBySession[s.client_local_id] ?? [],
    })),
  };
}

async function getExerciseProgressTool(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const exerciseName = String(args.exercise_name ?? '').trim();
  if (!exerciseName) return { error: 'exercise_name is required' };
  const days = clamp(Number(args.days ?? 84) || 84, 7, 365);
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: matches, error: exerciseError } = await supabase
    .from('exercises')
    .select('client_local_id, name')
    .eq('user_id', userId)
    .ilike('name', `%${exerciseName}%`)
    .limit(5);
  if (exerciseError) return { error: `exercise_query_failed: ${exerciseError.message}` };
  if (!(matches ?? []).length) return { error: `No exercise match found for "${exerciseName}"` };

  const exercise = matches![0]!;
  const { data: sets, error: setError } = await supabase
    .from('set_logs')
    .select('session_client_id, reps, weight_kg, duration_sec, distance_m, rpe')
    .eq('user_id', userId)
    .eq('exercise_client_id', exercise.client_local_id)
    .limit(2000);
  if (setError) return { error: `set_query_failed: ${setError.message}` };
  if (!(sets ?? []).length) return { exercise: exercise.name, sinceDays: days, sampleSets: 0 };

  const sessionIds = [...new Set((sets ?? []).map((s) => s.session_client_id))];
  const { data: sessions, error: sessionError } = await supabase
    .from('workout_sessions')
    .select('client_local_id, ended_at')
    .eq('user_id', userId)
    .in('client_local_id', sessionIds)
    .not('ended_at', 'is', null);
  if (sessionError) return { error: `session_query_failed: ${sessionError.message}` };

  const endedBySession = Object.fromEntries((sessions ?? []).map((s) => [s.client_local_id, s.ended_at]));
  const filtered = (sets ?? []).filter((s) => {
    const endedAt = endedBySession[s.session_client_id];
    return typeof endedAt === 'string' && endedAt >= sinceIso;
  });

  if (!filtered.length) return { exercise: exercise.name, sinceDays: days, sampleSets: 0 };

  let bestE1rm: number | null = null;
  let bestSet: Record<string, unknown> | null = null;
  let weightSum = 0;
  let weightCount = 0;
  let repSum = 0;
  let repCount = 0;

  for (const s of filtered) {
    const weight = s.weight_kg != null ? Number(s.weight_kg) : null;
    const reps = s.reps != null ? Number(s.reps) : null;
    if (weight != null && !Number.isNaN(weight)) {
      weightSum += weight;
      weightCount += 1;
    }
    if (reps != null && !Number.isNaN(reps)) {
      repSum += reps;
      repCount += 1;
    }
    if (weight != null && reps != null && reps > 0 && !Number.isNaN(weight)) {
      const e1rm = weight * (1 + reps / 30);
      if (bestE1rm == null || e1rm > bestE1rm) {
        bestE1rm = e1rm;
        bestSet = { weightKg: weight, reps, estimated1RmKg: Math.round(e1rm * 10) / 10 };
      }
    }
  }

  return {
    exercise: exercise.name,
    sinceDays: days,
    sampleSets: filtered.length,
    averageWeightKg: weightCount ? Math.round((weightSum / weightCount) * 10) / 10 : null,
    averageReps: repCount ? Math.round((repSum / repCount) * 10) / 10 : null,
    bestSet,
  };
}

async function getVolumeTrendTool(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const days = clamp(Number(args.days ?? 56) || 56, 14, 365);
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: sessions, error: sessionError } = await supabase
    .from('workout_sessions')
    .select('client_local_id, ended_at')
    .eq('user_id', userId)
    .not('ended_at', 'is', null)
    .gte('ended_at', sinceIso);
  if (sessionError) return { error: `session_query_failed: ${sessionError.message}` };

  const safeSessions = sessions ?? [];
  const sessionIds = safeSessions.map((s) => s.client_local_id);
  if (!sessionIds.length) return { days, weeklyVolumeKg: [] };

  const { data: sets, error: setError } = await supabase
    .from('set_logs')
    .select('session_client_id, reps, weight_kg')
    .eq('user_id', userId)
    .in('session_client_id', sessionIds);
  if (setError) return { error: `set_query_failed: ${setError.message}` };

  const endedBySession = Object.fromEntries(safeSessions.map((s) => [s.client_local_id, s.ended_at]));
  const buckets: Record<string, number> = {};
  for (const s of sets ?? []) {
    const endedAt = endedBySession[s.session_client_id];
    if (!endedAt) continue;
    const reps = s.reps != null ? Number(s.reps) : 0;
    const weight = s.weight_kg != null ? Number(s.weight_kg) : 0;
    if (!Number.isFinite(reps) || !Number.isFinite(weight)) continue;
    const volume = reps * weight;
    if (volume <= 0) continue;
    const k = weekStartIso(endedAt);
    buckets[k] = (buckets[k] ?? 0) + volume;
  }

  const weeklyVolumeKg = Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, volumeKg]) => ({
      weekStart,
      volumeKg: Math.round(volumeKg * 10) / 10,
    }));

  return { days, weeklyVolumeKg };
}

async function runTool(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  name: string,
  rawArgs: string
): Promise<Record<string, unknown>> {
  const args = parseArgs(rawArgs);
  switch (name) {
    case 'get_recent_sessions':
      return getRecentSessionsTool(supabase, userId, args);
    case 'get_exercise_progress':
      return getExerciseProgressTool(supabase, userId, args);
    case 'get_volume_trend':
      return getVolumeTrendTool(supabase, userId, args);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

async function openaiChat(
  openaiKey: string,
  model: string,
  messages: OpenAIMessage[],
  tools?: typeof TOOL_DEFS
): Promise<{
  ok: boolean;
  status: number;
  errorText?: string;
  message?: { content?: string | null; tool_calls?: ToolCall[] };
}> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      tools,
      temperature: 0.5,
      max_tokens: 900,
      tool_choice: tools ? 'auto' : undefined,
    }),
  });
  if (!res.ok) {
    return { ok: false, status: res.status, errorText: await res.text() };
  }
  const parsed = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] } }>;
  };
  return { ok: true, status: 200, message: parsed.choices?.[0]?.message };
}

async function resolveThreadId(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  providedThreadId: string | undefined,
  seedTitle: string
): Promise<string> {
  if (providedThreadId) {
    const { data } = await supabase
      .from('coach_threads')
      .select('id')
      .eq('id', providedThreadId)
      .eq('user_id', userId)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  const { data, error } = await supabase
    .from('coach_threads')
    .insert({ user_id: userId, title: seedTitle })
    .select('id')
    .single();
  if (error || !data?.id) {
    throw new Error(error?.message ?? 'Could not create thread');
  }
  return data.id;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json(401, { error: 'Missing authorization' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) return json(503, { error: 'AI not configured on server' });

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return json(401, { error: 'Invalid session' });

    const body = (await req.json()) as RequestBody;
    const fallbackFromMessages = (body.messages ?? [])
      .slice()
      .reverse()
      .find((m) => m.role === 'user' && typeof m.content === 'string')?.content;
    const userMessage = (body.userMessage ?? fallbackFromMessages ?? '').trim();
    if (!userMessage) return json(400, { error: 'userMessage required' });

    const threadTitle = userMessage.slice(0, 80);
    const threadId = await resolveThreadId(supabase, user.id, body.threadId, threadTitle);

    // Persist incoming user turn first so history survives partial failures.
    const { error: userMsgError } = await supabase.from('coach_messages').insert({
      thread_id: threadId,
      user_id: user.id,
      role: 'user',
      content: userMessage,
    });
    if (userMsgError) return json(500, { error: `Could not store user message: ${userMsgError.message}` });

    const { data: historyRows, error: historyError } = await supabase
      .from('coach_messages')
      .select('role, content')
      .eq('thread_id', threadId)
      .eq('user_id', user.id)
      .in('role', ['user', 'assistant'])
      .order('created_at', { ascending: true })
      .limit(60);
    if (historyError) return json(500, { error: `Could not load thread history: ${historyError.message}` });

    const system: OpenAIMessage = {
      role: 'system',
      content: [
        'You are GymBros Coach, a concise workout and training assistant.',
        'You are not a doctor or medical professional; do not diagnose or prescribe treatment.',
        'If the user asks for medical advice, tell them to consult a professional.',
        'Use metric units unless the user explicitly prefers otherwise.',
        'Be practical and specific. Prefer short bullet points when giving plans.',
        'When user asks about their progress, use tools to fetch workout data before answering.',
        body.contextSummary
          ? `Recent training context from device (may be incomplete):\n${body.contextSummary.slice(0, 5000)}`
          : 'No structured workout context was provided; give general guidance.',
      ].join('\n\n'),
    };

    const openaiMessages: OpenAIMessage[] = [
      system,
      ...(historyRows ?? []).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];
    const model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini';

    let finalReply = '';
    let loopMessages = [...openaiMessages];
    for (let i = 0; i < 4; i++) {
      const completion = await openaiChat(openaiKey, model, loopMessages, TOOL_DEFS);
      if (!completion.ok) {
        console.error('OpenAI error', completion.status, completion.errorText);
        return json(502, { error: 'Upstream AI error', threadId });
      }

      const message = completion.message;
      const toolCalls = message?.tool_calls ?? [];
      if (toolCalls.length) {
        loopMessages.push({
          role: 'assistant',
          content: message?.content ?? '',
          tool_calls: toolCalls,
        });
        for (const call of toolCalls) {
          const result = await runTool(supabase, user.id, call.function.name, call.function.arguments);
          loopMessages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(result),
          });
        }
        continue;
      }

      finalReply = (message?.content ?? '').trim();
      break;
    }

    if (!finalReply) {
      finalReply = "I couldn't generate a useful response. Try asking again with a bit more detail.";
    }

    const { error: assistantInsertError } = await supabase.from('coach_messages').insert({
      thread_id: threadId,
      user_id: user.id,
      role: 'assistant',
      content: finalReply,
    });
    if (assistantInsertError) {
      return json(500, { error: `Could not store assistant reply: ${assistantInsertError.message}`, threadId });
    }

    return json(200, { reply: finalReply, threadId });
  } catch (e) {
    console.error(e);
    return json(500, { error: 'Internal error' });
  }
});

