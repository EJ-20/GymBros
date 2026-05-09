import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };
type CoachExerciseInput = {
  name: string;
  muscleGroup?: string;
  trackingMode?: string;
  equipment?: string;
};
type CoachAction =
  | {
      type: 'createExercise';
      name: string;
      muscleGroup: string;
      trackingMode?: string;
      equipment?: string;
    }
  | {
      type: 'createRoutine';
      name: string;
      exercises: CoachExerciseInput[];
    };

const MUSCLE_GROUPS = new Set([
  'chest',
  'back',
  'shoulders',
  'arms',
  'legs',
  'core',
  'cardio',
  'full_body',
]);
const TRACKING_MODES = new Set(['weight_reps', 'bodyweight_reps', 'time', 'time_distance']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown, max = 80): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function cleanMuscleGroup(value: unknown): string | undefined {
  const text = cleanString(value);
  return text && MUSCLE_GROUPS.has(text) ? text : undefined;
}

function cleanTrackingMode(value: unknown): string | undefined {
  const text = cleanString(value);
  return text && TRACKING_MODES.has(text) ? text : undefined;
}

function sanitizeActions(value: unknown): CoachAction[] {
  if (!Array.isArray(value)) return [];
  const actions: CoachAction[] = [];

  for (const item of value.slice(0, 3)) {
    if (!isRecord(item)) continue;
    const type = item.type;
    const name = cleanString(item.name);
    if (!name) continue;

    if (type === 'createExercise') {
      const muscleGroup = cleanMuscleGroup(item.muscleGroup);
      if (!muscleGroup) continue;
      actions.push({
        type,
        name,
        muscleGroup,
        trackingMode: cleanTrackingMode(item.trackingMode),
        equipment: cleanString(item.equipment),
      });
      continue;
    }

    if (type === 'createRoutine') {
      const rawExercises = Array.isArray(item.exercises) ? item.exercises : [];
      const exercises: CoachExerciseInput[] = [];
      for (const rawExercise of rawExercises.slice(0, 16)) {
        if (!isRecord(rawExercise)) continue;
        const exerciseName = cleanString(rawExercise.name);
        if (!exerciseName) continue;
        exercises.push({
          name: exerciseName,
          muscleGroup: cleanMuscleGroup(rawExercise.muscleGroup),
          trackingMode: cleanTrackingMode(rawExercise.trackingMode),
          equipment: cleanString(rawExercise.equipment),
        });
      }
      if (!exercises.length) continue;
      actions.push({ type, name, exercises });
    }
  }

  return actions;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: 'AI not configured on server' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as {
      messages?: ChatMessage[];
      contextSummary?: string;
    };
    const messages = body.messages ?? [];
    if (!messages.length) {
      return new Response(JSON.stringify({ error: 'messages required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const system: ChatMessage = {
      role: 'system',
      content: [
        'You are GymBros Coach, a concise workout and training assistant.',
        'You are not a doctor or medical professional; do not diagnose or prescribe treatment.',
        'If the user asks for medical advice, tell them to consult a professional.',
        'Use metric units unless the user prefers otherwise.',
        'You can propose safe app edits, but the app will ask the user to confirm before applying them.',
        'Return only valid JSON shaped as {"reply":"string","actions":[]}.',
        'Only include actions when the user clearly asks you to create a routine or add an exercise.',
        'Supported actions:',
        '- {"type":"createExercise","name":"string","muscleGroup":"chest|back|shoulders|arms|legs|core|cardio|full_body","trackingMode":"weight_reps|bodyweight_reps|time|time_distance","equipment":"optional string"}',
        '- {"type":"createRoutine","name":"string","exercises":[{"name":"string","muscleGroup":"optional for new exercises","trackingMode":"optional","equipment":"optional"}]}',
        'Use existing exercise names from context when possible. For brand-new exercises in a routine, include muscleGroup.',
        'Do not invent database ids. Do not propose delete or edit actions.',
        body.contextSummary
          ? `Recent training context from their log (may be incomplete):\n${body.contextSummary}`
          : 'No structured workout context was provided; give general guidance.',
      ].join('\n\n'),
    };

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini',
        messages: [system, ...messages],
        response_format: { type: 'json_object' },
        max_tokens: 800,
        temperature: 0.6,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error('OpenAI error', openaiRes.status, errText);
      return new Response(JSON.stringify({ error: 'Upstream AI error' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const completion = (await openaiRes.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = completion.choices?.[0]?.message?.content?.trim() ?? '';
    let reply = text;
    let actions: CoachAction[] = [];

    try {
      const parsed = JSON.parse(text) as unknown;
      if (isRecord(parsed)) {
        reply = cleanString(parsed.reply, 2000) ?? '';
        actions = sanitizeActions(parsed.actions);
      }
    } catch {
      reply = text;
    }

    return new Response(JSON.stringify({ reply, actions }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

