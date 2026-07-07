'use strict';
/* ============================================================
 * API Form Console
 * - /v3/api-docs(OpenAPI 3.x)를 파싱해 필드별 입력 폼을 자동 생성
 * - 중첩 객체/배열 지원, $ref 순환 참조는 raw JSON 입력으로 폴백
 * - 파일 메타데이터(name/size/mimeType/extension) 자동 채움
 * ============================================================ */

const LS = { docs: 'apiform.docsUrl', base: 'apiform.baseUrl', auth: 'apiform.auth' };
// [Modified] 도메인 하드코딩 제거 — 페이지를 서빙한 서버의 origin 기준으로 자동 계산 (local/develop 공용)
const API_DOCS_PATH = '/v3/api-docs';
const DEFAULT_DOCS = location.origin + API_DOCS_PATH;
const MAX_DEPTH = 8;

const $ = (id) => document.getElementById(id);
let spec = null;
let operations = []; // { method, path, op }

/* ---------- 초기화 ---------- */
// [Modified] 저장값이 현재 origin과 다르면(프로토콜 불일치 포함) 무시하고 기본값 사용
const savedDocs = localStorage.getItem(LS.docs);
$('docsUrl').value = (savedDocs && savedDocs.startsWith(location.origin)) ? savedDocs : DEFAULT_DOCS;
const savedBase = localStorage.getItem(LS.base);
$('baseUrl').value = (savedBase && savedBase.startsWith(location.origin)) ? savedBase : '';
$('authHeader').value = localStorage.getItem(LS.auth) || '';

// [Added] 복사 아이콘 버튼 (Feather Icons) — 복사 성공 시 잠시 체크 아이콘으로 전환
const ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>';
let copyResetTimer = null;
$('btnCopy').innerHTML = ICON_COPY;

$('btnLoad').addEventListener('click', loadSpec);
$('epSelect').addEventListener('change', () => renderOperation(Number($('epSelect').value)));
$('btnPreview').addEventListener('click', () => setPreviewOpen($('previewWrap').classList.contains('hidden'))); // [Modified]
$('btnCopy').addEventListener('click', copyPreview); // [Modified]
$('btnSend').addEventListener('click', sendRequest);
$('btnFillToggle').addEventListener('click', () => setFillOpen($('fillArea').classList.contains('hidden'))); // [Modified]
$('btnFillApply').addEventListener('click', applyJsonToForm); // [Added]
$('authHeader').addEventListener('change', e => localStorage.setItem(LS.auth, e.target.value));
$('baseUrl').addEventListener('change', e => localStorage.setItem(LS.base, e.target.value));

/* ---------- 스펙 로드 ---------- */
async function loadSpec() {
  const url = $('docsUrl').value.trim();
  hide('loadErr');
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    spec = await res.json();
    localStorage.setItem(LS.docs, url);

    // Base URL: api-docs URL에서 /v3/api-docs 앞부분을 잘라 계산 (springdoc 관례)
    if (!$('baseUrl').value.trim()) {
      $('baseUrl').value = url.replace(/\/v3\/api-docs.*$/, '');
      localStorage.setItem(LS.base, $('baseUrl').value);
    }
    buildEndpointList();
    show('epPanel');
    renderOperation(0);
  } catch (e) {
    spec = null;
    $('loadErr').textContent =
            `스펙 로드 실패: ${e.message}\n` +
            `- URL이 맞는지 확인하세요 (springdoc 기본: {prefix}/v3/api-docs)\n` +
            `- 이 페이지를 API 서버의 static 리소스로 서빙하지 않는 경우 CORS 허용이 필요합니다`;
    show('loadErr');
    ['epPanel','paramPanel','bodyPanel','sendPanel'].forEach(hide);
  }
}

function buildEndpointList() {
  operations = [];
  const byTag = new Map();
  for (const [path, pathItem] of Object.entries(spec.paths || {})) {
    for (const method of ['get','post','put','patch','delete','head','options']) {
      const op = pathItem[method];
      if (!op) continue;
      const idx = operations.length;
      operations.push({ method: method.toUpperCase(), path, op, pathItem });
      const tag = (op.tags && op.tags[0]) || '기타';
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag).push(idx);
    }
  }
  const sel = $('epSelect');
  sel.innerHTML = '';
  for (const [tag, idxs] of [...byTag.entries()].sort((a,b)=>a[0].localeCompare(b[0]))) {
    const og = document.createElement('optgroup');
    og.label = tag;
    for (const i of idxs) {
      const { method, path, op } = operations[i];
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `${method.padEnd(6)} ${path}${op.summary ? '  — ' + op.summary : ''}`;
      og.appendChild(opt);
    }
    sel.appendChild(og);
  }
}

/* ---------- $ref 해석 ---------- */
function resolveRef(ref) {
  // '#/components/schemas/Xxx' 형태만 지원
  const parts = ref.replace(/^#\//, '').split('/');
  let cur = spec;
  for (const p of parts) cur = cur && cur[p];
  return cur;
}

/** $ref/allOf를 풀어 실제 스키마 반환. 순환이면 { __circular: true } */
function deref(schema, seen) {
  let s = schema;
  while (s && s.$ref) {
    if (seen.has(s.$ref)) return { __circular: true, ref: s.$ref };
    seen.add(s.$ref);
    s = resolveRef(s.$ref);
    if (!s) return { type: 'object' };
  }
  if (s && s.allOf) {
    const merged = { type: 'object', properties: {}, required: [] };
    for (const part of s.allOf) {
      const d = deref(part, new Set(seen));
      if (d.__circular) continue;
      Object.assign(merged.properties, d.properties || {});
      merged.required.push(...(d.required || []));
    }
    return merged;
  }
  return s || {};
}

/* ---------- 오퍼레이션 렌더링 ---------- */
function renderOperation(idx) {
  const { method, path, op, pathItem } = operations[idx];
  $('epSelect').value = idx;
  $('epMethod').textContent = method;
  $('epMethod').className = `badge b-${method}`;
  $('epPath').textContent = path;
  $('epSummary').textContent = op.summary || op.description || '';
  setPreviewOpen(false); setFillOpen(false); // [Modified] 버튼 라벨까지 초기 상태로 복원
  lastPastedJson = null; // [Modified] 이전 엔드포인트에서 붙여넣은 JSON의 null 병합 누수 방지
  hide('resBox'); hide('resStatus'); hide('resMeta'); hide('sendErr');

  // 파라미터
  const params = [...(pathItem.parameters || []), ...(op.parameters || [])]
          .map(p => p.$ref ? resolveRef(p.$ref) : p)
          .filter(p => p && (p.in === 'path' || p.in === 'query' || p.in === 'header'));
  const rows = $('paramRows');
  rows.innerHTML = '';
  if (params.length) {
    for (const p of params) {
      const row = document.createElement('div');
      row.className = 'prow';
      const sch = deref(p.schema || {}, new Set());
      row.innerHTML = `
      <span class="pname">${esc(p.name)}${p.required ? '<span class="req">*</span>' : ''}</span>
      <span class="pin">${p.in}</span>`;
      const input = makePrimitiveControl(sch);
      input.dataset.pname = p.name;
      input.dataset.pin = p.in;
      if (p.description) input.title = p.description;
      row.appendChild(input);
      rows.appendChild(row);
    }
    show('paramPanel');
  } else hide('paramPanel');

  // Request Body
  const form = $('bodyForm');
  form.innerHTML = '';
  const content = op.requestBody && op.requestBody.content;
  const jsonSchema = content && content['application/json'] && content['application/json'].schema;
  if (jsonSchema) {
    const root = renderNode(jsonSchema, null, false, new Set(), 0);
    root.dataset.root = '1';
    form.appendChild(root);
    show('bodyPanel');
  } else hide('bodyPanel');

  show('sendPanel');
}

/* ---------- 폼 노드 렌더링 (재귀) ---------- */
function renderNode(rawSchema, key, required, seen, depth) {
  const schema = deref(rawSchema, seen);

  // 순환 참조 or 최대 깊이 초과 → raw JSON 입력 폴백
  if (schema.__circular || depth > MAX_DEPTH) {
    return makeRawNode(key, schema.__circular
            ? `순환 참조 (${schema.ref.split('/').pop()}) — JSON 직접 입력`
            : '최대 깊이 초과 — JSON 직접 입력');
  }

  const type = schema.type || (schema.properties ? 'object' : undefined);

  // oneOf/anyOf → 첫 번째 스키마 사용
  if (!type && (schema.oneOf || schema.anyOf)) {
    return renderNode((schema.oneOf || schema.anyOf)[0], key, required, new Set(seen), depth);
  }

  if (type === 'object') {
    if (!schema.properties) return makeRawNode(key, 'free-form object — JSON 직접 입력');
    return makeObjectNode(schema, key, seen, depth);
  }
  if (type === 'array') {
    return makeArrayNode(schema, key, required, seen, depth);
  }
  return makePrimitiveNode(schema, key, required);
}

function makeObjectNode(schema, key, seen, depth) {
  const isRoot = key === null;
  const node = document.createElement(isRoot ? 'div' : 'details');
  node.className = 'node';
  node.dataset.kind = 'object';
  if (key !== null) node.dataset.key = key;
  if (!isRoot) {
    node.open = true;
    const sum = document.createElement('summary');
    sum.textContent = key;
    node.appendChild(sum);
  }

  const props = document.createElement('div');
  props.className = 'props';
  const requiredList = schema.required || [];
  const entries = Object.entries(schema.properties);

  for (const [pKey, pSchema] of entries) {
    props.appendChild(renderNode(pSchema, pKey, requiredList.includes(pKey), new Set(seen), depth + 1));
  }

  // 파일 메타데이터 자동 채움: 관련 필드가 2개 이상 감지되면 노출
  const matched = detectFileFields(entries.map(([k]) => k));
  if (matched.count >= 2) {
    const ff = document.createElement('div');
    ff.className = 'filefill';
    const fi = document.createElement('input');
    fi.type = 'file';
    const label = document.createElement('span');
    label.textContent = '파일 선택 시 자동 채움: ' + matched.names.join(', ');
    fi.addEventListener('change', () => {
      const file = fi.files[0];
      if (file) fillFileMeta(props, file);
    });
    ff.appendChild(fi);
    ff.appendChild(label);
    props.prepend(ff);
  }

  node.appendChild(props);
  return node;
}

function makeArrayNode(schema, key, required, seen, depth) {
  const node = document.createElement('div');
  node.className = 'node';
  node.dataset.kind = 'array';
  if (key !== null) node.dataset.key = key;

  const head = document.createElement('div');
  head.className = 'arrhead';
  head.innerHTML = `<span class="lbl">${esc(key ?? '(root array)')}${required ? '<span class="req">*</span>' : ''}<span class="typehint">array</span></span>`;
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'sm';
  addBtn.textContent = '+ 항목 추가';
  head.appendChild(addBtn);
  node.appendChild(head);

  const items = document.createElement('div');
  items.className = 'items';
  node.appendChild(items);

  const itemSchema = schema.items || {};
  addBtn.addEventListener('click', () => {
    const item = document.createElement('div');
    item.className = 'item';
    item.appendChild(renderNode(itemSchema, null, false, new Set(seen), depth + 1));
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'sm';
    del.textContent = '삭제';
    del.addEventListener('click', () => item.remove());
    item.appendChild(del);
    items.appendChild(item);
  });
  return node;
}

function makePrimitiveNode(schema, key, required) {
  const node = document.createElement('div');
  node.className = 'node';
  node.dataset.kind = 'primitive';
  if (key !== null) node.dataset.key = key;
  node.dataset.type = (schema.type === 'integer') ? 'number' : (schema.type || 'string');

  const row = document.createElement('div');
  row.className = 'row';
  const hint = [schema.type || 'string', schema.format].filter(Boolean).join(':');
  const lbl = document.createElement('span');
  lbl.className = 'lbl';
  lbl.innerHTML = `${esc(key ?? '(item)')}${required ? '<span class="req">*</span>' : ''}<span class="typehint">${esc(hint)}</span>`;
  if (schema.description) lbl.title = schema.description;
  row.appendChild(lbl);

  const ctrl = makePrimitiveControl(schema);
  row.appendChild(ctrl);
  node.appendChild(row);
  return node;
}

function makePrimitiveControl(schema) {
  let ctrl;
  if (schema.enum) {
    ctrl = document.createElement('select');
    ctrl.innerHTML = '<option value="">(선택 안함)</option>' +
            schema.enum.map(v => `<option value="${esc(String(v))}">${esc(String(v))}</option>`).join('');
  } else if (schema.type === 'boolean') {
    ctrl = document.createElement('select');
    ctrl.innerHTML = '<option value="">(선택 안함)</option><option value="true">true</option><option value="false">false</option>';
  } else if (schema.type === 'integer' || schema.type === 'number') {
    ctrl = document.createElement('input');
    ctrl.type = 'number';
    if (schema.type === 'number') ctrl.step = 'any';
  } else {
    ctrl = document.createElement('input');
    ctrl.type = 'text';
    if (schema.format === 'date-time') ctrl.placeholder = '2026-07-06T12:00:00Z';
    else if (schema.format === 'date') ctrl.placeholder = '2026-07-06';
    else if (schema.example !== undefined) ctrl.placeholder = String(schema.example);
  }
  ctrl.className = 'ctrl';
  return ctrl;
}

function makeRawNode(key, note) {
  const node = document.createElement('div');
  node.className = 'node';
  node.dataset.kind = 'raw';
  if (key !== null) node.dataset.key = key;
  const lbl = document.createElement('div');
  lbl.className = 'circular-note';
  lbl.textContent = `${key ?? '(item)'} — ${note}`;
  const ta = document.createElement('textarea');
  ta.placeholder = '{ "field": "value" }  ※ 비우면 제외';
  node.appendChild(lbl);
  node.appendChild(ta);
  return node;
}

/* ---------- 파일 메타데이터 자동 채움 ---------- */
const FILE_FIELD_PATTERNS = {
  name:      /^(file)?name$|originalfilename|originalname/i,
  size:      /^(file)?size$/i,
  mimeType:  /mimetype|contenttype|mime_type|content_type/i,
  extension: /^ext(ension)?$|fileext/i,
};

function detectFileFields(keys) {
  const names = [];
  for (const [kind, re] of Object.entries(FILE_FIELD_PATTERNS)) {
    const hit = keys.find(k => re.test(k));
    if (hit) names.push(hit);
  }
  return { count: names.length, names };
}

function fillFileMeta(propsEl, file) {
  const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
  const values = {
    name: file.name,
    size: file.size,
    mimeType: file.type || '',
    extension: ext,
  };
  propsEl.querySelectorAll(':scope > .node[data-kind=primitive]').forEach(n => {
    const key = n.dataset.key;
    for (const [kind, re] of Object.entries(FILE_FIELD_PATTERNS)) {
      if (re.test(key)) {
        const input = n.querySelector('.ctrl');
        input.value = values[kind];
        break;
      }
    }
  });
}

/* ---------- JSON → 폼 자동 채움 [Added] ---------- */
let lastPastedJson = null; // [Added] null 포함 전송용 원본 보관

function applyJsonToForm() {
  const root = $('bodyForm').querySelector('[data-root]');
  if (!root) return;
  let data;
  try { data = JSON.parse($('fillJson').value); }
  catch (e) { alert('JSON 파싱 실패: ' + e.message); return; }
  lastPastedJson = data; // [Added]
  fillNode(root, data);
}

/** collectNode의 역방향 — JSON 값을 폼 구조에 재귀 주입. 스키마에 없는 키는 무시 */
function fillNode(el, value) {
  if (value === undefined || value === null) return;
  const kind = el.dataset.kind;

  if (kind === 'primitive') {
    el.querySelector('.ctrl').value = String(value); // boolean → 'true'/'false'가 select 옵션과 일치
  } else if (kind === 'raw') {
    el.querySelector('textarea').value = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  } else if (kind === 'object') {
    if (typeof value !== 'object' || Array.isArray(value)) return;
    el.querySelectorAll(':scope > .props > .node').forEach(ch => {
      if (ch.dataset.key in value) fillNode(ch, value[ch.dataset.key]);
    });
  } else if (kind === 'array') {
    if (!Array.isArray(value)) return;
    const items = el.querySelector(':scope > .items');
    items.innerHTML = ''; // 기존 항목 초기화 후 JSON 배열 길이만큼 생성
    const addBtn = el.querySelector(':scope > .arrhead button');
    for (const v of value) {
      addBtn.click();
      fillNode(items.lastElementChild.querySelector(':scope > .node'), v);
    }
  }
}

/* ---------- 값 수집 (재귀) ---------- */
function collectNode(el) {
  const kind = el.dataset.kind;

  if (kind === 'primitive') {
    const v = el.querySelector('.ctrl').value;
    if (v === '') return undefined;
    if (el.dataset.type === 'number') { const n = Number(v); return isNaN(n) ? undefined : n; }
    if (el.dataset.type === 'boolean') return v === 'true';
    return v;
  }
  if (kind === 'raw') {
    const raw = el.querySelector('textarea').value.trim();
    if (!raw) return undefined;
    try { return JSON.parse(raw); }
    catch { throw new Error(`"${el.dataset.key ?? '(item)'}" 필드의 JSON 파싱 실패`); }
  }
  if (kind === 'object') {
    const out = {};
    el.querySelectorAll(':scope > .props > .node').forEach(ch => {
      const v = collectNode(ch);
      if (v !== undefined) out[ch.dataset.key] = v;
    });
    return Object.keys(out).length ? out : undefined;
  }
  if (kind === 'array') {
    const arr = [];
    el.querySelectorAll(':scope > .items > .item > .node').forEach(ch => {
      const v = collectNode(ch);
      if (v !== undefined) arr.push(v);
    });
    return arr.length ? arr : undefined;
  }
  return undefined;
}

function buildBody() {
  const root = $('bodyForm').querySelector('[data-root]');
  if (!root) return undefined;
  let body = collectNode(root);
  // [Added] 체크 시 붙여넣은 원본에서 null이던 필드를 body에 null로 포함 (명시적 null 전송)
  if ($('chkIncludeNulls').checked && lastPastedJson) {
    body = mergeNulls(body, lastPastedJson);
  }
  return body;
}

// [Added] source(원본 JSON)에서 null인 키를 target(폼 수집값)에 null로 채움
// 중첩 객체는 재귀 처리, 배열 내부는 인덱스 매칭이 모호하므로 미처리
function mergeNulls(target, source) {
  if (typeof source !== 'object' || source === null || Array.isArray(source)) return target;
  const out = (typeof target === 'object' && target !== null && !Array.isArray(target)) ? target : {};
  for (const [k, v] of Object.entries(source)) {
    if (v === null) {
      if (!(k in out)) out[k] = null;
    } else if (typeof v === 'object' && !Array.isArray(v) && k in out) {
      out[k] = mergeNulls(out[k], v);
    }
  }
  return Object.keys(out).length ? out : target;
}

/* ---------- 미리보기 / 전송 ---------- */
// [Modified] 미리보기·붙여넣기 영역은 상호배타 토글 — 하나를 열면 다른 쪽은 닫힘
function setPreviewOpen(open) {
  if (open) {
    setFillOpen(false);
    try {
      const body = buildBody();
      $('previewBox').textContent = body === undefined ? '(body 없음 — 빈 요청)' : JSON.stringify(body, null, 2);
      show('btnCopy');
    } catch (e) {
      $('previewBox').textContent = '오류: ' + e.message;
      hide('btnCopy');
    }
    show('previewWrap');
  } else {
    hide('previewWrap');
  }
  $('btnPreview').textContent = open ? '미리보기 접기' : 'JSON 미리보기';
}

function setFillOpen(open) {
  if (open) setPreviewOpen(false);
  (open ? show : hide)('fillArea');
  $('btnFillToggle').textContent = open ? '붙여넣기 접기' : 'JSON 붙여넣기';
}

// [Added] 미리보기 JSON 복사 — 성공 시 1.4초간 체크 아이콘으로 피드백
async function copyPreview() {
  const text = $('previewBox').textContent;
  let ok = true;
  try { await navigator.clipboard.writeText(text); }
  catch {
    // clipboard API를 쓸 수 없는 비보안(http) 컨텍스트 폴백
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ok = document.execCommand('copy');
    ta.remove();
  }
  if (!ok) return;
  $('btnCopy').innerHTML = ICON_CHECK;
  $('btnCopy').classList.add('copied');
  clearTimeout(copyResetTimer);
  copyResetTimer = setTimeout(() => {
    $('btnCopy').innerHTML = ICON_COPY;
    $('btnCopy').classList.remove('copied');
  }, 1400);
}

async function sendRequest() {
  hide('sendErr'); hide('resBox'); hide('resStatus'); hide('resMeta');
  const idx = Number($('epSelect').value);
  const { method, path } = operations[idx];

  try {
    // URL 조립: path param 치환 + query string
    let url = path;
    const qs = new URLSearchParams();
    const headers = { };
    document.querySelectorAll('#paramRows .ctrl').forEach(input => {
      const v = input.value;
      if (v === '') return;
      if (input.dataset.pin === 'path') url = url.replace(`{${input.dataset.pname}}`, encodeURIComponent(v));
      else if (input.dataset.pin === 'query') qs.append(input.dataset.pname, v);
      else if (input.dataset.pin === 'header') headers[input.dataset.pname] = v;
    });
    if ([...url.matchAll(/\{([^}]+)\}/g)].length) throw new Error('치환되지 않은 path parameter가 있습니다: ' + url);

    const base = $('baseUrl').value.trim().replace(/\/$/, '');
    const fullUrl = base + url + (qs.toString() ? '?' + qs.toString() : '');

    const auth = $('authHeader').value.trim();
    if (auth) headers['Authorization'] = auth;

    const body = ['GET','HEAD'].includes(method) ? undefined : buildBody();
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const t0 = performance.now();
    const res = await fetch(fullUrl, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const elapsed = Math.round(performance.now() - t0);

    const text = await res.text();
    let pretty = text;
    try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch {}

    $('resStatus').textContent = `${res.status} ${res.statusText}`;
    $('resStatus').className = 'status ' + (res.ok ? 's-ok' : 's-err');
    $('resMeta').textContent = `${elapsed}ms · ${method} ${fullUrl}`;
    $('resBox').textContent = pretty || '(empty body)';
    show('resStatus'); show('resMeta'); show('resBox');
  } catch (e) {
    $('sendErr').textContent = '요청 실패: ' + e.message;
    show('sendErr');
  }
}

/* ---------- 유틸 ---------- */
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }
