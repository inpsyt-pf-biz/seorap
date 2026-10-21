// 체험판 만들기(deno task demo [결과 파일 경로]):
//  1) 로컬 DB에서 가짜 데이터 꺼내기(demo-snapshot.ts)
//  2) 체험판 빌드(web/vite.demo.config.ts)
//  3) 빌드한 JS·CSS를 HTML 한 파일 안에 넣기(더블클릭으로 열 수 있게)
//  4) 비밀값(.env.local 의 값)·실제 DB 주소가 섞이지 않았는지 검사. 섞였으면 파일을 지우고 멈춘다
import { ENV_FILE, readEnvFile, WEB_ENV_FILE } from './local.ts'

const root = new URL('../', import.meta.url)
const web = new URL('web/', root)
const target: string | URL = Deno.args[0] ?? new URL('.demo/상담예약관리-체험판.html', web)

async function run(cmd: string, args: string[], cwd: URL) {
  const exe = Deno.build.os === 'windows' && cmd === 'npm' ? 'npm.cmd' : cmd
  const out = await new Deno.Command(exe, { args, cwd, stdout: 'inherit', stderr: 'inherit' }).output()
  if (!out.success) throw new Error(`${cmd} ${args.join(' ')} 실패`)
}

await run('deno', ['run', '-A', 'scripts/demo-snapshot.ts'], root)
await run('npm', ['run', 'build:demo'], web)

// 3) 묶기. 모듈 스크립트는 HTML 안에 넣어도 문서를 다 읽은 뒤에 돈다
const dist = new URL('.demo/dist/', web)
let html = await Deno.readTextFile(new URL('demo.html', dist))
const asset = (src: string) => Deno.readTextFile(new URL(src.replace(/^\.\//, ''), dist))
for (const m of [...html.matchAll(/<script type="module" crossorigin src="([^"]+)"><\/script>/g)]) {
  const js = (await asset(m[1])).replace(/<\/script/gi, '<\\/script')
  html = html.replace(m[0], () => `<script type="module">${js}</script>`)
}
for (const m of [...html.matchAll(/<link rel="stylesheet" crossorigin href="([^"]+)">/g)]) {
  const css = (await asset(m[1])).replace(/<\/style/gi, '<\\/style')
  html = html.replace(m[0], () => `<style>${css}</style>`)
}
if (/src="\.\/assets\/|href="\.\/assets\//.test(html)) throw new Error('묶지 못한 파일이 남았어요(./assets/...)')

// 4) 비밀값 검사. 값은 찍지 않고 이름만 알린다
const secrets: [string, string][] = []
for (const file of [ENV_FILE, WEB_ENV_FILE]) {
  let text = ''
  try { text = await Deno.readTextFile(file) } catch { /* 없으면 넘어간다 */ }
  for (const [k, v] of Object.entries(readEnvFile(text))) if (v.length >= 8 && !/^(local|true|false)$/i.test(v)) secrets.push([k, v])
}
// 실행 환경의 VITE_*·COUNSEL_* 값도 본다
for (const [k, v] of Object.entries(Deno.env.toObject())) if (/^(VITE_|COUNSEL_)/.test(k) && v.length >= 8) secrets.push([k, v])
const leaked = secrets.filter(([, v]) => html.includes(v)).map(([k]) => k)
// 실제 DB 연결(supabase-js)이 딸려 들어왔는지도 본다. 안내 문구 속 '127.0.0.1:56321' 은 괜찮다
const realDb = ['http://127.0.0.1:5632', 'http://localhost:5632', 'supabase.co', 'GoTrueClient'].filter((s) => html.includes(s))
if (leaked.length > 0 || realDb.length > 0) {
  throw new Error(`체험판 파일에 들어가면 안 되는 값이 있어요: ${[...leaked, ...realDb].join(', ')}. 파일을 만들지 않았어요`)
}

await Deno.writeTextFile(target, html)
console.log(`체험판: ${decodeURIComponent(String(target))} (${(html.length / 1024 / 1024).toFixed(2)}MB, 비밀값 ${secrets.length}개 검사 통과)`)
