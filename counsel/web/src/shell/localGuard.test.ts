import { describe, expect, it } from 'vitest'
import { isAllowedStackUrl, isLocalStackUrl, PREVIEW_STACK_URL } from './localGuard'

describe('DB 주소 가드', () => {
  it('로컬 상담 툴 스택만 로컬로 본다', () => {
    expect(isLocalStackUrl('http://127.0.0.1:56321')).toBe(true)
    expect(isLocalStackUrl('http://localhost:56321')).toBe(true)
    expect(isLocalStackUrl('http://127.0.0.1:54321')).toBe(false)
    expect(isLocalStackUrl(undefined)).toBe(false)
  })

  it('미리보기 프로젝트는 미리보기 환경일 때만 허용한다', () => {
    expect(isAllowedStackUrl(PREVIEW_STACK_URL, 'preview')).toBe(true)
    expect(isAllowedStackUrl(PREVIEW_STACK_URL, 'local')).toBe(false)
    expect(isAllowedStackUrl(PREVIEW_STACK_URL, undefined)).toBe(false)
  })

  it('미리보기 환경이어도 다른 프로젝트 주소는 막는다', () => {
    expect(isAllowedStackUrl('https://abcdefghijklmnopqrst.supabase.co', 'preview')).toBe(false)
    expect(isAllowedStackUrl(`${PREVIEW_STACK_URL}/`, 'preview')).toBe(false)
    expect(isAllowedStackUrl(undefined, 'preview')).toBe(false)
  })

  it('로컬 주소는 환경 이름과 상관없이 허용한다', () => {
    expect(isAllowedStackUrl('http://127.0.0.1:56321', undefined)).toBe(true)
    expect(isAllowedStackUrl('http://127.0.0.1:56321', 'preview')).toBe(true)
  })
})
