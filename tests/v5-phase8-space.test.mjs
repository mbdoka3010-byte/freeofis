import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createV5Platform } from '../v5/platform/platform.mjs';
import { createExperienceServices, registerCaptureProviders, registerSharedWorkProviders } from '../v5/experience/experience.mjs';
import { registerSpaceProviders } from '../v5/experience/space.mjs';
import { V5_DATABASE_VERSION, V5_STORES } from '../v5/persistence/schema.mjs';
import { MemoryV5Persistence } from './helpers/memory-v5-persistence.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dueAt = new Date(Date.now() + 60_000).toISOString();
async function setup() {
  const persistence = new MemoryV5Persistence();
  const platform = await createV5Platform({ persistence, cryptoApi: crypto });
  const registered = await platform.registerUser({ displayName: 'Space Owner' });
  const token = await platform.sessions.create(registered.user.id);
  const workspace = await platform.activateWorkspace(token, { definitionId: 'standard:space', ownerType: 'personal', ownerId: registered.user.id });
  const scope = { ownerType: 'personal', ownerId: registered.user.id, organisationId: null, unitId: null, workspaceId: workspace.id };
  const personalContext = (await platform.listContexts(token))[0];
  return { persistence, platform, user: registered.user, token, workspace, scope, personalContext };
}
async function user(platform, name) {
  const registered = await platform.registerUser({ displayName: name });
  return { user: registered.user, token: await platform.sessions.create(registered.user.id) };
}

assert.equal(V5_DATABASE_VERSION, 8, 'My Space remains preserved by the additive Business schema');

// Shared Tasks, Events, Notes, Projects, Files/Documents and Records power a useful personal home.
{
  const s = await setup();
  const task = await s.platform.space.createTask(s.token, { ...s.scope, title: 'Renew passport', description: 'Prepare photo', dueAt, priority: 'high' });
  const reminder = await s.platform.space.createReminder(s.token, { ...s.scope, title: 'Call family', remindAt: dueAt });
  const note = await s.platform.space.createNote(s.token, { ...s.scope, title: 'Passport checklist', content: 'Photo and form' });
  const goal = await s.platform.space.createGoal(s.token, { ...s.scope, title: 'Complete renewal', description: 'Renew documents', targetDate: dueAt });
  const document = await s.platform.sharedWork.create(s.token, 'document', { ...s.scope, title: 'Application form', documentType: 'form' });
  const uploaded = await s.platform.capture.ingestFile(s.token, { ...s.scope, title: 'Certificate', filename: 'certificate.pdf', mediaType: 'application/pdf', size: 12, payload: 'private-binary' });
  assert.equal(task.ownerType, 'personal'); assert.equal(task.ownerId, s.user.id); assert.equal(reminder.startAt, dueAt);
  assert.equal((await s.platform.capture.getFileMetadata(s.token, uploaded.file.id)).payload, undefined);
  assert.equal(await s.platform.capture.getFilePayload(s.token, uploaded.file.id), 'private-binary');
  const taskGoal = await s.platform.space.link(s.token, { ...s.scope, sourceType: 'task', sourceId: task.id, targetType: 'project', targetId: goal.id, relationshipType: 'supports' });
  await s.platform.space.link(s.token, { ...s.scope, sourceType: 'note', sourceId: note.id, targetType: 'project', targetId: goal.id, relationshipType: 'supports' });
  assert.equal(taskGoal.targetId, goal.id);
  const home = await s.platform.space.home(s.token, s.scope);
  assert.ok(home.dueToday.some(x => x.id === task.id)); assert.ok(home.reminders.some(x => x.id === reminder.id)); assert.ok(home.goals.some(x => x.id === goal.id));
  assert.ok(home.recentNotes.some(x => x.id === note.id)); assert.ok(home.recentFiles.some(x => x.id === document.id)); assert.ok(home.recentFiles.some(x => x.id === uploaded.file.id));
  assert.equal((await s.platform.sharedWork.completeTask(s.token, task.id)).completionState, 'completed');
  const completed = await s.platform.space.transitionGoal(s.token, goal.id, 'completed');
  assert.equal(completed.status, 'completed'); assert.equal('progress' in completed, false); assert.equal('percentage' in completed, false);
  const record = await s.platform.space.retain(s.token, { ...s.scope, sourceType: 'file', sourceId: uploaded.file.id, title: 'Retained certificate', recordType: 'certificate' });
  assert.deepEqual(record.provenance, { origin: 'derived', sourceType: 'file', sourceId: uploaded.file.id, reference: null });
}

// Search, My Day, Quick Create, Ink and Knowledge all remain personal and contextual.
{
  const s = await setup(), services = createExperienceServices(s.platform);
  registerSharedWorkProviders(services, s.platform); registerCaptureProviders(services, s.platform, { capabilities: { fileSelection: true, camera: false, microphone: false, pointerInk: true } }); registerSpaceProviders(services, s.platform, { capabilities: { fileSelection: true, pointerInk: true } });
  const task = await s.platform.space.createTask(s.token, { ...s.scope, title: 'Personal deadline', dueAt });
  const reminder = await s.platform.space.createReminder(s.token, { ...s.scope, title: 'Personal appointment', remindAt: dueAt });
  const note = await s.platform.space.createNote(s.token, { ...s.scope, title: 'Private astronomy notes', content: 'Orion' });
  const goal = await s.platform.space.createGoal(s.token, { ...s.scope, title: 'Astronomy course' });
  const ink = await s.platform.capture.createInk(s.token, { ...s.scope, title: 'Handwritten reflection', width: 300, height: 200, strokes: [{ tool: 'pen', color: '#111111', width: 2, points: [{ x: 1, y: 2, t: 1 }] }] });
  const knowledge = await s.platform.capture.createKnowledgeSource(s.token, { ...s.scope, title: 'Personal ink knowledge', sourceType: 'ink', sourceEntityType: 'ink', sourceEntityId: ink.ink.id, searchText: 'reflection' });
  const day = await services.myDay.list(s.token, s.personalContext);
  assert.ok(day.some(x => x.id === task.id && x.workspaceId === s.workspace.id)); assert.ok(day.some(x => x.id === reminder.id && x.workspaceId === s.workspace.id));
  const search = await services.search.search(s.token, s.personalContext, 'astronomy'); assert.ok(search.some(x => x.id === note.id)); assert.ok(search.some(x => x.id === goal.id));
  const labels = (await services.quickCreate.list(s.token, s.personalContext)).map(x => x.label);
  for (const label of ['Task', 'Note', 'Reminder', 'Goal', 'Upload File', 'Handwritten Note']) assert.ok(labels.includes(label));
  const outsider = await user(s.platform, 'Unrelated User'), outsideContext = (await s.platform.listContexts(outsider.token))[0];
  assert.equal((await services.search.search(outsider.token, outsideContext, 'astronomy')).length, 0); assert.equal((await services.myDay.list(outsider.token, outsideContext)).length, 0);
  await assert.rejects(s.platform.capture.getKnowledgeSource(outsider.token, knowledge.id), /ACCESS_DENIED/);
}

// Another user and every organisation authority level remain outside the absolute personal boundary.
{
  const s = await setup(), privateNote = await s.platform.space.createNote(s.token, { ...s.scope, title: 'Only mine', content: 'Never disclose' });
  const organisationOwner = await user(s.platform, 'Organisation Owner'), org = await s.platform.createOrganisation(organisationOwner.token, { name: 'Authority Org' });
  const admin = await user(s.platform, 'Administrator'), manager = await user(s.platform, 'Manager');
  await s.platform.addMembership(organisationOwner.token, { userId: admin.user.id, organisationId: org.organisation.id, roleCode: 'admin' });
  await s.platform.addMembership(organisationOwner.token, { userId: manager.user.id, organisationId: org.organisation.id, roleCode: 'manager' });
  for (const actor of [organisationOwner, admin, manager]) {
    await assert.rejects(s.platform.sharedWork.get(actor.token, 'note', privateNote.id), /ACCESS_DENIED/);
    await assert.rejects(s.platform.space.home(actor.token, s.scope), /MY_SPACE_ACCESS_DENIED/);
  }
  const unrelated = await user(s.platform, 'Other Person');
  await assert.rejects(s.platform.space.home(unrelated.token, s.scope), /MY_SPACE_ACCESS_DENIED/);
  const orgContext = (await s.platform.listContexts(organisationOwner.token)).find(x => x.organisationId === org.organisation.id && !x.unitId);
  const services = createExperienceServices(s.platform); registerSharedWorkProviders(services, s.platform);
  assert.equal((await services.search.search(organisationOwner.token, orgContext, 'Only mine')).length, 0);
}

// Goal creation is atomic with its underlying shared Project and private-content logs stay content-free.
{
  const s = await setup(), original = s.persistence.runTransaction.bind(s.persistence);
  s.persistence.runTransaction = async (names, mode, work) => original(names, mode, async tx => work({ ...tx, add: async (store, value) => { if (store === V5_STORES.activityEvents && value.eventType === 'project.created') throw Error('injected goal failure'); return tx.add(store, value); } }));
  await assert.rejects(s.platform.space.createGoal(s.token, { ...s.scope, title: 'Rollback goal' }), /injected goal failure/);
  assert.equal((await s.persistence.getAll(V5_STORES.projects)).length, 0);
  const logs = [...await s.persistence.getAll(V5_STORES.activityEvents), ...await s.persistence.getAll(V5_STORES.auditEvents)];
  assert.equal(logs.some(x => JSON.stringify(x).includes('Rollback goal')), false);
}

// The browser shell remains lazy, welcoming, mobile-card based, and uses existing touch targets.
{
  const main = fs.readFileSync(path.join(root, 'v5/app/main.mjs'), 'utf8'), landing = fs.readFileSync(path.join(root, 'v5/workspaces/space/landing.mjs'), 'utf8'), css = fs.readFileSync(path.join(root, 'v5/app/styles.css'), 'utf8');
  assert.match(main, /import\('\.\.\/workspaces\/space\/landing\.mjs'\)/); assert.match(landing, /Private to you/); assert.match(landing, /Nothing is due today/); assert.match(landing, /Tasks.*Notes.*Files.*Reminders.*Goals.*Records/s); assert.match(css, /min-height:\s*44px/);
}

process.stdout.write('All Free Ofis V5 Phase 8 My Space privacy, personal work, capture, experience, and atomicity checks passed.\n');
