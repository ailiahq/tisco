import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  ASPECT_QUESTIONS,
  clipQuestionIds,
  clipSpecs,
  feasibilityFromRoute,
  routeSpecs,
  workspaceQuestionBatch,
  workspaceRouteRequest,
} from '../dist/decisions.js';
import { admitted, report } from '../dist/gates.js';
import { workspaceSnapshot, workspaceState } from '../dist/workspace-state.js';

const folders = [];
const source = { path: 'a.mov', size: 1, mtimeMs: 1, ino: 1, dev: 1 };
const clip = { path: 'a.mov', fingerprint: source };
const evidence = {
  clip,
  transcript: { version: 1, model: 'stt', source, prompt: '', timeUnit: 'ms', status: 'complete', timing: 'word', text: 'ok', words: [], segments: [], durationMs: 1, cost: 0 },
};
const requestState = request => workspaceState(workspaceSnapshot({ clips: [clip], folders }, [evidence]), { instruction: request, projectContext: '', session: { selection: [], previousResult: [], uncertain: [] } });
const noul = value => ({ type: 'noul', noul: value });
const aspectIds = Object.values(ASPECT_QUESTIONS);

function stub(script) {
  const calls = [];
  return {
    calls,
    async decide(state, questions) {
      calls.push({ state, ids: Object.keys(questions).sort() });
      return Object.fromEntries(Object.entries(questions).map(([id, question]) => {
        if (!(id in script)) throw new Error(`Not scripted for ${id}`);
        const answer = script[id];
        return [id, question.type === 'noul'
          ? noul(answer)
          : { type: 'choice', choice: answer, confidence: 0.9, probabilities: Object.fromEntries(Object.keys(question.criteria).map(option => [option, option === answer ? 0.9 : 0.02])) }];
      }));
    },
  };
}

const routeAnswers = {
  ops_find: 0.95,
  ops_create: 0.95,
  ops_move: 0.95,
  ops_rename: 0.05,
  criterion_requested: 0.95,
  target_set: 'all_here',
  destination_name: 'none',
  rename_suffix: 'none',
  spoken_content_decides: 0.95,
  needs_picture: 0.05,
  needs_sound: 0.05,
  needs_measurement: 0.05,
  needs_external_record: 0.05,
};

test('route uses one speculative fan-out call, including feasibility', async () => {
  const client = stub(routeAnswers);
  const request = 'find the clips where they explain the price';
  const answers = await workspaceRouteRequest(client, requestState(request), request, folders);
  assert.equal(client.calls.length, 1);
  for (const id of ['spoken_content_decides', ...aspectIds]) assert.ok(client.calls[0].ids.includes(id), id);
  assert.ok(client.calls[0].state.workspace);
  assert.equal(client.calls[0].state.instruction, request);
  assert.equal(answers.spoken_content_decides.noul, 0.95);
});

test('an unfiltered request still uses one route call and leaves relevance to code', async () => {
  const client = stub({ ...routeAnswers, ops_find: 0.05, criterion_requested: 0.05 });
  const request = 'move every clip into selects';
  await workspaceRouteRequest(client, requestState(request), request, folders);
  assert.equal(client.calls.length, 1);
  for (const id of aspectIds) assert.ok(client.calls[0].ids.includes(id), id);
});

test('all feasibility questions are admitted independently', () => {
  const specs = routeSpecs(folders);
  const asked = admitted(specs, {});
  for (const id of ['spoken_content_decides', ...aspectIds]) {
    assert.ok(asked.some(spec => spec.id === id), id);
    assert.equal(report(specs.filter(spec => spec.id === id), {})[0].state, 'asked');
  }
  assert.ok(!asked.some(spec => spec.id === 'ops_extract'));
});

test('feasibility fails open when evidence is missing or inconclusive', () => {
  const none = { picture: false, pictureOnly: false, aspects: [], unjudgeable: [], limited: false };
  assert.deepEqual(feasibilityFromRoute({}), { spoken: true, ...none });
  assert.deepEqual(feasibilityFromRoute({ spoken_content_decides: noul(0.02) }), { spoken: false, ...none });
  assert.deepEqual(feasibilityFromRoute({ spoken_content_decides: noul(0.02), needs_sound: noul(0.79) }), { spoken: false, ...none });
});

test('a request is refused only when a limitation is clear and the words are not', () => {
  const at = (spoken, sound) => ({ spoken_content_decides: noul(spoken), needs_sound: noul(sound) });
  assert.equal(feasibilityFromRoute(at(0.05, 0.95)).limited, true);
  assert.equal(feasibilityFromRoute(at(0.45, 0.95)).limited, true);
  assert.equal(feasibilityFromRoute(at(0.9, 0.95)).limited, false);
  assert.equal(feasibilityFromRoute(at(0.05, 0.45)).limited, false, 'an uncertain reason never blocks');
});

test('independent Nouls preserve multiple simultaneous limitations', () => {
  const result = feasibilityFromRoute({
    spoken_content_decides: noul(0.9),
    needs_picture: noul(0.94),
    needs_sound: noul(0.91),
    needs_measurement: noul(0.08),
    needs_external_record: noul(0.05),
  });
  assert.deepEqual(result, { spoken: true, picture: true, pictureOnly: false, aspects: ['sound'], unjudgeable: ['picture', 'sound'], limited: false });
});

test('a look is judged from stills, never a reason to refuse', () => {
  const at = (spoken, picture, sound = 0.05) => feasibilityFromRoute({ spoken_content_decides: noul(spoken), needs_picture: noul(picture), needs_sound: noul(sound) });
  assert.deepEqual(at(0.05, 0.95), { spoken: false, picture: true, pictureOnly: true, aspects: [], unjudgeable: [], limited: false });
  // Measured live: "find the clips with a red background" read spoken 0.68. Asking the words
  // too let an irrelevant 0.11 veto a 0.99 look, so an unsure words answer means look only.
  assert.equal(at(0.68, 0.95).pictureOnly, true, 'words that do not confidently decide are not asked');
  assert.deepEqual(at(0.9, 0.95).unjudgeable, ['picture'], 'mixed: the words question ignores the look the stills judge');
  assert.deepEqual(at(0.05, 0.95, 0.95), { spoken: false, picture: true, pictureOnly: true, aspects: ['sound'], unjudgeable: ['sound'], limited: false }, 'look + sound: judge the look, set the sound aside');
});

test('picture-only requests ask about the stills and not the words', () => {
  const rule = { request: 'the clips where he is smiling', context: '', mode: 'custom', destination: 'selects', reference: null, threshold: 0.8, extra: [] };
  const ids = options => clipQuestionIds(rule, { hasCriterion: true, hasReference: false, ...options });
  assert.ok(!ids({}).includes('matches_picture'), 'no stills, no picture question');
  assert.ok(ids({ hasPicture: true }).includes('matches_picture') && ids({ hasPicture: true }).includes('matches_request'));
  const only = ids({ hasPicture: true, hasSpoken: false });
  assert.ok(only.includes('matches_picture') && !only.includes('matches_request'), only.join());
  const snapshot = workspaceSnapshot({ clips: [clip], folders }, [evidence]);
  const batch = workspaceQuestionBatch(snapshot, [clip.path], rule, { hasCriterion: true, hasReference: false, hasPicture: true, hasSpoken: false });
  assert.match(batch.questions.video_0__matches_picture.instructions, /workspace\.videos\[0\]\.frames/);
});

test('stills attach only to the named clip and are counted outside the text budget', async () => {
  const { requestBytes } = await import('../dist/openrouter.js');
  const snapshot = workspaceSnapshot({ clips: [clip], folders }, [evidence]);
  const image = { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${'A'.repeat(500_000)}` } };
  const state = workspaceState(snapshot, { instruction: 'x', projectContext: '', session: { selection: [], previousResult: [], uncertain: [] }, frames: { 'a.mov': [{ at_ms: 0, image }] } });
  assert.equal(state.workspace.videos[0].frames.length, 1);
  const bytes = requestBytes(state);
  assert.ok(bytes.images >= 500_000 && bytes.text < 5_000, JSON.stringify(bytes));
});

test('set-aside parts travel with only the question that needs them', () => {
  const rule = { request: 'well-lit clips with clean audio where they explain the price', context: '', mode: 'custom', destination: 'falas', reference: null, threshold: 0.8, extra: [] };
  const options = { hasCriterion: true, hasReference: false };
  const asked = admitted(clipSpecs(rule, options), {}).filter(spec => spec.tier === 1);
  assert.deepEqual(asked.filter(spec => spec.consumes.includes('unjudgeable')).map(spec => spec.id), ['matches_request']);
  assert.equal(clipQuestionIds(rule, options).length, asked.length);
  const snapshot = workspaceSnapshot({ clips: [clip], folders }, [evidence]);
  const batch = workspaceQuestionBatch(snapshot, [clip.path], rule, options);
  const matchQuestion = batch.questions.video_0__matches_request;
  assert.match(matchQuestion.instructions, /unjudgeable/);
  assert.ok(!('unjudgeable' in workspaceState(snapshot, { instruction: rule.request, projectContext: '', session: { selection: [], previousResult: [], uncertain: [] } })));
  const mixed = workspaceState(snapshot, { instruction: rule.request, projectContext: '', session: { selection: [], previousResult: [], uncertain: [] }, unjudgeable: ['picture', 'sound'] });
  assert.deepEqual(mixed.unjudgeable, ['picture', 'sound']);
});
