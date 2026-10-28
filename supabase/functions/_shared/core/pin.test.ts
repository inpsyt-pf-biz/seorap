import { assertEquals } from '@std/assert'
import { checkPin } from './pin.ts'

Deno.test('checkPin: 숫자 6자리만 받는다', () => {
  for (const pin of ['', '12345', '1234567', '12a456', ' 13579', '１３５７９２']) {
    assertEquals(checkPin(pin), 'format', JSON.stringify(pin))
  }
  assertEquals(checkPin(135792), 'format')
  assertEquals(checkPin(null), 'format')
})

Deno.test('checkPin: 같은 숫자 6개와 이어지는 숫자는 쉬운 PIN', () => {
  for (const pin of ['000000', '111111', '999999', '123456', '234567', '456789', '654321', '987654', '012345', '543210']) {
    assertEquals(checkPin(pin), 'weak', pin)
  }
})

Deno.test('checkPin: 그 밖의 6자리는 통과', () => {
  for (const pin of ['135792', '112233', '090412', '123457', '890123', '246810']) {
    assertEquals(checkPin(pin), null, pin)
  }
})
