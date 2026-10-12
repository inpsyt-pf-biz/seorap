# 네이버 상품주문 칸 목록 (커머스API 상품 주문 상세 내역 조회)

`POST /v1/pay-order/seller/product-orders/query` 응답의 칸 전체입니다. 공식 문서 v2.90.1(2026-10-12 기준)을 그대로 대조했고, 근거는 각 행의 `#번호`(github.com/commerce-api-naver/commerce-api/discussions)입니다.

- "원장 칸"이 적힌 값만 상담 원장(20261012000004)이 받습니다. 나머지는 연동 쪽 원본 저장처를 설계할 때 다룹니다.
- 배송지·수거지 주소, 개인통관고유부호는 상담 상품에 쓰지 않는 개인정보라 원장에 받지 않습니다.
- 서랍 `app.order_items.option_code`는 네이버가 2026-07-22에 없앤 칸(optionCode)입니다. 대신 `itemNo`를 받아야 합니다.

## 정리

- 필드 수(공식 스키마 기준): order 18개. productOrder 98개(스칼라 91개와 하위 객체 7개: shippingAddress 18, takingAddress 11, hopeDelivery 6, skuMappings[] 3, appliedCoupons[] 4, standardPurchaseOptions[] 3, appliedCardPromotion 4). delivery 10개. currentClaim.cancel 12개. currentClaim.return 39개(주소 2개 포함). currentClaim.exchange 41개(주소 3개 포함). completedClaims[] 50개(주소 3개 포함). 주소 객체의 기본 필드는 11개이고, returnReceiveAddress에만 logisticsCenterId가 더 있습니다. beforeClaim.exchange와 구 data[n].cancel/return/exchange는 대응하는 currentClaim 노드와 스키마가 같습니다.
- 이미 제거된 필드: productOrder.optionCode가 2026-07-22에 제거됐고 itemNo로 대체됐습니다(#3595, #3646). 범례 코드 중에는 holdbackReason의 EXCHANGE_HOLDBACK, ETC2가 2026-08-05에 제거됐습니다(#3686).
- 제거 예정: data[n].cancel, data[n].return, data[n].exchange(구 클레임 노드)가 2026-10-28에 응답에서 빠집니다(#3608). 오늘(10-12) 기준 16일 남았습니다. 같은 날 productOrder.oneTimeIndividualCustomsCode와 oneTimeCertificationNo가 추가됩니다(#3869). 둘 다 v2.90.1 문서에는 아직 없습니다.
- 제거 공지가 있었지만 남아 있는 구 필드: quantity, totalPaymentAmount, totalProductAmount, productDiscountAmount 4개는 '25년 중 제거 예정'으로 공지됐습니다(#1773, #2692). 2026-10 현재 스키마에 그대로 있고 제거일 공지는 없습니다. 2026년 공식 답변(#3868)도 totalPaymentAmount를 initialPaymentAmount와 같은 값으로 안내합니다. 구 할인 필드 4개(productImediateDiscountAmount, productProductDiscountAmount, sellerBurdenImediateDiscountAmount, sellerBurdenProductDiscountAmount)는 사정이 다릅니다. 이들은 호출 시점 값을 주고 remain- 필드가 계승하며, 제거 일정은 공지되지 않았습니다.
- 주문자 관련(공식 Q&A): ordererId는 항상 마스킹되고, 2026-01-07부터 앞 4자리만 보입니다. 6자 이하 ID는 앞 2자리에 '****'가 붙습니다(#404, #2084, #3136). ordererNo는 같은 구매자인지 판별할 때 쓰지만, 네이버페이 탈회 후 재가입하면 바뀝니다(#404). 일반 주문의 ordererTel은 마스킹하지 않습니다(#2084). 세금이나 공급가를 나눈 금액 필드는 없습니다(#3868). completedClaims의 reDeliveryAddress는 릴리즈노트(#2080) 표기와 달리 completedClaims[n] 바로 아래에 있습니다. 2026-10-12(#3886)까지 공지된 새 필드는 #3869뿐입니다.
- 값 목록이 정해지지 않은 것: (1) 공식 값 목록이 없는 자유 텍스트 필드가 있습니다. inflowPath, inflowPathAdd(#3020: 운영 중 바뀔 수 있음), productClass, shippingFeeType, deliveryPolicyType, requestChannel, refundStandbyStatus/Reason, claimDeliveryFeePayMeans/PayMethod, etcFeePayMeans/PayMethod, wrongTrackingNumberType이 그렇고, sellerBurdenMultiplePurchaseDiscountType은 값의 뜻이 문서에 없습니다. (2) 택배사 코드 200여 종 전체는 note에 대표 코드만 적었고, 전체 범례는 공식 문서에 있습니다. (3) logisticsCompanyId와 logisticsCenterId는 범례가 제공되지 않습니다(#329). (4) 거래 종료 61일 후 마스킹되는 필드의 정확한 목록이 공지(#3116)에 없습니다. shippingAddress의 name, tel1, 주소 계열이 대상으로 보이지만 확인되지 않았습니다. (5) 문서에는 없고 실제 응답에만 오는 필드가 있는지는 라이브 호출 없이 확인할 수 없습니다. 실제 응답 원문을 한 건 저장해 이 목록과 대조하면 닫을 수 있습니다.
- 금액 계산 관계(공식 FAQ #3641, #2250, #2251, #1058): initialProductAmount=(unitPrice+optionPrice)×initialQuantity이고, initialPaymentAmount=initialProductAmount−initialProductDiscountAmount입니다. 할인 총액은 즉시 할인, 상품 할인 쿠폰, 복수 구매 할인, 스토어 할인을 더한 값입니다. 네이버 부담분은 initialProductDiscountAmount−initialSellerBurdenDiscountAmount입니다. 부과 배송비는 deliveryFeeAmount+sectionDeliveryFee−deliveryDiscountAmount이고, packageNumber 묶음당 한 번만 셉니다. order.* 결제 금액은 주문서 단위라서 장바구니 주문이면 다른 스토어 금액이 섞일 수 있습니다. 상품주문별 금액은 productOrder.remainPaymentAmount(현재)나 initialPaymentAmount(주문 시점)를 씁니다. initial- 필드는 주문 시점 값이고 remain- 필드는 API 호출 시점 잔여값입니다(#3022). 다음 4개는 항상 주문 시점 값입니다: productMultiplePurchaseDiscountAmount, sellerBurdenDiscountAmount, sellerBurdenMultiplePurchaseDiscountAmount, sellerBurdenStoreDiscountAmount.
- 클레임 읽는 법: currentClaim은 가장 최근 클레임 1건만 담고, 안에 claimType이 없습니다. 유형은 하위 노드 이름(cancel/return/exchange)이나 productOrder.claimType으로 판별합니다. 이력 전체는 completedClaims[]에 있습니다. completedClaims는 통합 스키마라서 이름이 다릅니다. claimRequestReason은 cancel/return/exchangeReason에, claimRequestDetailContent는 상세 사유에, claimRequestAdmissionDate는 cancelApprovalDate에, claimCompleteOperationDate는 cancel/returnCompletedDate에 대응합니다. 해당 없는 필드는 null입니다(#1773). returnImageUrl, exchangeImageUrl, returnCompletedDate, cancelCompletedDate는 completedClaims에 없습니다. 반대로 collectOperationDate, collectStartTime, collectEndTime, collectSlotId는 completedClaims에만 있습니다. 수량 일부 취소가 끝나면 productOrderStatus=PAYED, claimType=CANCEL, claimStatus=CANCEL_DONE이 함께 나올 수 있습니다(#3023).

## response(root) (3)

| 칸 | 뜻 | 형식 | 원장 칸 | 비고 |
|---|---|---|---|---|
| `timestamp` | 응답 생성 시각 | string(date-time) |  |  |
| `traceId` | 요청 추적 ID | string |  | 필수 |
| `data` | 상품주문 정보 목록 | array<object> |  | 요소 1개 = 상품주문번호 1개. 하위 노드: order, productOrder, delivery, currentClaim, beforeClaim, completedClaims, (구)cancel/return/exchange. 값이 null인 노드·필드는 JSON에서 아예 빠짐(#2023) |

## request (2)

| 칸 | 뜻 | 형식 | 원장 칸 | 비고 |
|---|---|---|---|---|
| `productOrderIds` | 조회할 상품주문번호 목록 | array<string> |  | 필수, 최대 300개 |
| `quantityClaimCompatibility` | 수량 클레임 대응 완료 여부(요청 body 최상위) | boolean |  | 응답 결과에 영향 없음(v2.43.0 공식 노트 #2080). 대응을 마쳤으면 true 권장(#2692) |

## order (18)

| 칸 | 뜻 | 형식 | 원장 칸 | 비고 |
|---|---|---|---|---|
| `orderId` | 주문번호 | string | naver_product_orders.external_order_id | 주문번호 1개에 상품주문번호 N개(#24) |
| `orderDate` | 주문 일시 | string(date-time) | naver_product_orders.ordered_at |  |
| `paymentDate` | 결제 일시(최종 결제) | string(date-time) | purchases.paid_at |  |
| `paymentDueDate` | 결제 기한 | string(date-time) |  |  |
| `paymentMeans` | 결제 수단 | string |  | 한글 값: 신용카드, 신용카드 간편결제, 휴대폰, 휴대폰 간편결제, 계좌 간편결제, 무통장입금, 포인트/머니결제, 패밀리결제, 후불결제. 2025-09-17 '포인트결제'가 '포인트/머니결제'로 바뀜(#2863) |
| `payLocationType` | 결제 위치(PC/MOBILE) | string |  |  |
| `ordererId` | 주문자 네이버 ID(마스킹됨) | string |  | 항상 마스킹 값으로 제공(#404, #2084). 2026-01-07부터 앞 4자리만 노출, 6자 이하 ID는 앞 2자리+'****'(#3136) |
| `ordererNo` | 주문자 번호 | string | naver_orderers.orderer_no_hash | 같은 구매자인지 판별할 때 쓰는 값. 네이버페이 탈회 후 재가입하면 바뀜(#404) |
| `ordererName` | 주문자 이름 | string | naver_orderers.name_enc / name_masked | 선물하기 주문은 2025-11-26부터 확인 불가(#3027). 거래 종료(구매확정·취소완료·반품완료·미결제취소) 61일 뒤 마스킹, 2026-01-07부터 과거 주문 소급(#3116) |
| `ordererTel` | 주문자 연락처 | string | naver_orderers.tel_enc / tel_masked / tel_hash | 2025-05-28부터 '-' 포함 형식(AAA-BBBB-CCCC, 과거 주문 포함, v2.56.0 #2584). 일반 주문은 마스킹하지 않음(#2084). 선물하기 주문은 2024-11-27부터 마스킹(#2115). 거래 종료 61일 뒤 마스킹(#3116) |
| `isMembershipSubscribed` | 주문 시점 네이버플러스 멤버십 가입 여부 | boolean |  | 2025-07-23 추가(v2.60.0 #2729) |
| `isDeliveryMemoParticularInput` | 배송 메모 개별 입력 여부 | string |  | boolean이 아니라 문자열 |
| `generalPaymentAmount` | 일반 결제수단 결제 금액 | integer |  | 주문번호(주문서) 단위. 장바구니 주문이면 다른 스토어 상품 금액이 섞일 수 있어, 상품주문별 금액은 productOrder.remainPaymentAmount를 쓰라는 공식 안내(#1058) |
| `naverMileagePaymentAmount` | 네이버페이 포인트 결제 금액 | integer |  | 주문번호 단위(#1058) |
| `chargeAmountPaymentAmount` | 충전금(네이버페이 머니) 결제 금액 | integer |  | 주문번호 단위(#1058) |
| `payLaterPaymentAmount` | 후불 결제 금액 | integer |  | 주문번호 단위(#1058) |
| `checkoutAccumulationPaymentAmount` | 네이버페이 적립금 결제 금액 | integer |  | 구 체크아웃 호환 필드. 최근 주문에서는 의미 있는 값이 없음(#1058) |
| `orderDiscountAmount` | 주문 할인액 | integer |  | 주문번호 단위 |

## productOrder (101)

| 칸 | 뜻 | 형식 | 원장 칸 | 비고 |
|---|---|---|---|---|
| `productOrderId` | 상품주문번호 | string | naver_product_orders.naver_product_order_id | 저장 시 고유키로 권장(#24) |
| `productOrderStatus` | 상품주문 상태 | string | naver_product_orders.product_order_status | PAYMENT_WAITING=결제 대기, PAYED=결제 완료, DELIVERING=배송 중, DELIVERED=배송 완료, PURCHASE_DECIDED=구매 확정, EXCHANGED=교환, CANCELED=취소, RETURNED=반품, CANCELED_BY_NOPAYMENT=미결제 취소. 수량 일부 취소가 끝나도 잔여 수량이 있으면 PAYED(#3023) |
| `claimType` | 최근 클레임 구분 | string | naver_product_orders.claim_type | CANCEL=취소, RETURN=반품, EXCHANGE=교환, PURCHASE_DECISION_HOLDBACK=구매 확정 보류, ADMIN_CANCEL=직권 취소. 가장 최근 클레임 기준(#1692). currentClaim 노드 안에는 claimType이 없음 |
| `claimStatus` | 최근 클레임 상태 | string | naver_product_orders.claim_status | CANCEL_REQUEST=취소 요청, CANCELING=취소 처리 중, CANCEL_DONE=취소 완료, CANCEL_REJECT=취소 철회, RETURN_REQUEST=반품 요청, EXCHANGE_REQUEST=교환 요청, COLLECTING=수거 처리 중, COLLECT_DONE=수거 완료, EXCHANGE_REDELIVERING=교환 재배송 중, RETURN_DONE=반품 완료, EXCHANGE_DONE=교환 완료, RETURN_REJECT=반품 철회, EXCHANGE_REJECT=교환 철회, PURCHASE_DECISION_HOLDBACK=구매 확정 보류, PURCHASE_DECISION_REQUEST=구매 확정 요청, PURCHASE_DECISION_HOLDBACK_RELEASE=구매 확정 보류 해제, ADMIN_CANCELING=직권 취소 중, ADMIN_CANCEL_DONE=직권 취소 완료, ADMIN_CANCEL_REJECT=직권 취소 철회 |
| `claimId` | 최근 클레임 번호 | string |  | 추가 클레임이 생기면 최신 ID, 철회되면 이전 ID로 돌아감(#1692, #1814) |
| `placeOrderStatus` | 발주 확인 상태 | string | naver_product_orders.place_order_status | NOT_YET=발주 미확인, OK=발주 확인, CANCEL=발주 확인 해제 |
| `placeOrderDate` | 발주 확인 일시 | string(date-time) |  |  |
| `shippingDueDate` | 발송 기한 | string(date-time) |  | 오늘출발 상품은 주문 당일 23:59:59(#1377). 배송 방법·카테고리에 따라 계산이 다름(#3408) |
| `shippingStartDate` | 발송 시작일 | string(date-time) |  | 예약구매 주문만 제공. 2023-11-15 추가(#1204) |
| `arrivalGuaranteeDate` | 도착 보장 일시 | string(date-time) |  | N배송 주문만(#329). 2022-12-20 추가(#328) |
| `decisionDate` | 구매 확정 일시 | string(date-time) | naver_product_orders.decided_at |  |
| `delayedDispatchReason` | 발송 지연 사유 코드 | string |  | PRODUCT_PREPARE=상품 준비 중, CUSTOMER_REQUEST=고객 요청, CUSTOM_BUILD=주문 제작, RESERVED_DISPATCH=예약 발송, OVERSEA_DELIVERY=해외 배송, ETC=기타 |
| `delayedDispatchDetailedReason` | 발송 지연 상세 사유 | string |  |  |
| `productId` | 채널 상품번호 | string | naver_product_orders.naver_product_id |  |
| `originalProductId` | 원상품번호 | string | naver_product_orders.original_product_id | 2023-05-17 추가(#705). 'originProductId'라는 이름은 이 응답에 없음 |
| `merchantChannelId` | 채널 번호 | string |  | 2023-05-17 추가(#705) |
| `groupProductId` | 그룹상품 번호 | number |  | 다른 상품 ID와 달리 number 타입. 2024-10-10 추가, 2024-10-16 이후 주문부터(#2005) |
| `productName` | 상품명 | string | purchases.product_name |  |
| `productOption` | 선택 옵션 내용(옵션명) | string | naver_product_orders.option_name | 선물하기 수락 과정에서 바뀔 수 있음(#15) |
| `productClass` | 상품 종류(일반/추가 상품 구분) | string |  | 공식 값 목록 없음 |
| `itemNo` | 아이템 번호(옵션·추가상품 구분 고유값) | string | naver_product_orders.item_no | optionCode 대체 필드. 조합형/표준형 옵션 상품=옵션 ID, 추가상품=추가상품 ID, 단순형 옵션·단일상품=채널상품번호(#3595) |
| `optionCode` | 옵션 코드 | string |  | REMOVED 2026-07-22(v2.83.0 #3646). 응답에 더 이상 오지 않음, itemNo로 대체 |
| `optionManageCode` | 판매자 입력 옵션 관리 코드 | string |  | 옵션·추가상품일 때 |
| `sellerProductCode` | 판매자 상품 코드 | string | naver_product_orders.seller_product_code |  |
| `sellerCustomCode1` | 판매자 내부 코드 1 | string |  |  |
| `sellerCustomCode2` | 판매자 내부 코드 2 | string |  |  |
| `mallId` | 가맹점 ID | string |  |  |
| `taxType` | 과면세 구분 | string |  | TAXATION=과세, TAX_EXEMPTION=면세, TAX_FREE=영세. 2025-07-23 추가(#2729) |
| `storageType` | 옵션 보관 유형 | string |  | DRY=상온, WET=냉장, FROZEN=냉동. 추가 시점 릴리즈노트는 찾지 못함 |
| `quantity` | 주문 수량(구 필드) | integer | naver_product_orders.quantity (initialQuantity 가 없을 때) | initialQuantity와 같은 값. '25년 중 제거 예정' 공지(#1773, #2692)가 있었으나 2026-10 현재 v2.90.1에 남아 있고 제거일 공지 없음 |
| `initialQuantity` | 주문 시점 수량 | integer | naver_product_orders.quantity | 클레임이 끝나도 바뀌지 않음. 2024-10-10 추가(#2005) |
| `remainQuantity` | 현재 잔여 수량 | integer | naver_product_orders.remain_quantity | API 호출 시점 값. 수량 클레임 완료 시 줄어듦. 2024-10-10 추가 |
| `unitPrice` | 상품 단가 | integer |  |  |
| `optionPrice` | 옵션 금액 | integer |  | 음수일 수 있음(#3641) |
| `totalProductAmount` | 주문 금액(할인 전, 구 필드) | integer |  | initialProductAmount와 같은 값. '25년 중 제거 예정' 공지됐으나 잔존 |
| `initialProductAmount` | 주문 시점 주문 금액(할인 전) | integer |  | =(unitPrice+optionPrice)×initialQuantity(#3641). 클레임 후에도 불변 |
| `remainProductAmount` | 현재 주문 금액(할인 전) | integer |  | API 호출 시점 잔여 수량 기준 |
| `totalPaymentAmount` | 결제 금액(할인 후, 구 필드) | integer | naver_product_orders.payment_amount (initialPaymentAmount 가 없을 때) | initialPaymentAmount와 같은 값(2026 공식 답변 #3868에서도 확인). 세금·공급가를 나눈 필드는 없음(#3868). '25년 중 제거 예정' 공지됐으나 잔존 |
| `initialPaymentAmount` | 주문 시점 결제 금액(할인 후) | integer | naver_product_orders.payment_amount | =initialProductAmount−initialProductDiscountAmount(#3641). 클레임 후에도 불변 |
| `remainPaymentAmount` | 현재 결제 금액(할인 후) | integer | naver_product_orders.remain_payment_amount | 상품주문별 실결제액으로 쓰라는 공식 안내(#1058) |
| `productDiscountAmount` | 상품별 할인액(구 필드) | integer |  | initialProductDiscountAmount와 같은 값. '25년 중 제거 예정' 공지됐으나 잔존 |
| `initialProductDiscountAmount` | 주문 시점 상품별 할인 총액 | integer |  | =즉시 할인+상품 할인 쿠폰+복수 구매 할인+스토어 할인(#3641) |
| `remainProductDiscountAmount` | 현재 상품별 할인 총액 | integer |  |  |
| `productImediateDiscountAmount` | 상품별 즉시 할인(구 필드) | integer |  | 철자 Imediate(m 1개). 호출 시점 값이며 remain- 필드가 계승(#1773). 제거 일정 공지 없음 |
| `initialProductImmediateDiscountAmount` | 주문 시점 상품별 즉시 할인 | integer |  | 2025-07-09 추가(v2.62.0 #2685). 릴리즈노트 표기는 Imediate, 스키마는 Immediate |
| `remainProductImmediateDiscountAmount` | 현재 상품별 즉시 할인 | integer |  | 2025-07-09 추가 |
| `productProductDiscountAmount` | 상품별 상품 할인 쿠폰(구 필드) | integer |  | 호출 시점 값, remain- 필드가 계승(#1773) |
| `initialProductProductDiscountAmount` | 주문 시점 상품 할인 쿠폰 | integer |  | 2025-07-09 추가 |
| `remainProductProductDiscountAmount` | 현재 상품 할인 쿠폰 | integer |  | 2025-07-09 추가 |
| `productMultiplePurchaseDiscountAmount` | 상품별 복수 구매 할인 | integer |  | 항상 주문 시점 값, initial/remain 짝 없음(#1773, #2250) |
| `sellerBurdenDiscountAmount` | 판매자 부담 할인 합계 | integer |  | 항상 주문 시점 값(#1773). 네이버 부담분=initialProductDiscountAmount−initialSellerBurdenDiscountAmount(#2250) |
| `initialSellerBurdenDiscountAmount` | 주문 시점 판매자 부담 할인 | integer |  | 2026-03-18 추가(v2.74.0 #3314) |
| `remainSellerBurdenDiscountAmount` | 현재 판매자 부담 할인 | integer |  | 2026-03-18 추가. 2026-03-19 이후 체결 주문만 값이 옴(#3314) |
| `sellerBurdenImediateDiscountAmount` | 판매자 부담 즉시 할인(구 필드) | integer |  | 철자 Imediate. 호출 시점 값, remain- 필드가 계승(#1773). 2024-05-29 설명 정정(#1730) |
| `initialSellerBurdenImmediateDiscountAmount` | 주문 시점 판매자 부담 즉시 할인 | integer |  | 2025-07-09 추가 |
| `remainSellerBurdenImmediateDiscountAmount` | 현재 판매자 부담 즉시 할인 | integer |  | 2025-07-09 추가 |
| `sellerBurdenProductDiscountAmount` | 판매자 부담 상품 할인 쿠폰(구 필드) | integer |  | 호출 시점 값, remain- 필드가 계승(#1773) |
| `initialSellerBurdenProductDiscountAmount` | 주문 시점 판매자 부담 상품 할인 쿠폰 | integer |  | 2025-07-09 추가 |
| `remainSellerBurdenProductDiscountAmount` | 현재 판매자 부담 상품 할인 쿠폰 | integer |  | 2025-07-09 추가 |
| `sellerBurdenMultiplePurchaseDiscountAmount` | 판매자 부담 복수 구매 할인 | integer |  | 항상 주문 시점 값(#1773) |
| `initialSellerBurdenMultiplePurchaseDiscountAmount` | 주문 시점 판매자 부담 복수 구매 할인 | integer |  | 2026-03-18 추가(#3314) |
| `remainSellerBurdenMultiplePurchaseDiscountAmount` | 현재 판매자 부담 복수 구매 할인 | integer |  | 2026-03-18 추가(#3314) |
| `sellerBurdenMultiplePurchaseDiscountType` | 판매자 부담 복수 구매 할인 방식 | string |  | IGNORE_QUANTITY, QUANTITY(값의 뜻은 문서에 없음) |
| `sellerBurdenStoreDiscountAmount` | 판매자 부담 스토어 할인 | integer |  | 주문 시점 값 고정. 부분 클레임으로 쿠폰이 취소돼도 반영 안 됨(#1642) |
| `initialSellerBurdenStoreDiscountAmount` | 주문 시점 판매자 부담 스토어 할인 | integer |  | 2026-03-18 추가(#3314) |
| `remainSellerBurdenStoreDiscountAmount` | 현재 판매자 부담 스토어 할인 | integer |  | 2026-03-18 추가. 2026-03-19 이후 체결 주문만 값이 옴(#3314) |
| `deliveryFeeAmount` | 배송비 합계(할인 전) | integer |  | 부과 배송비=deliveryFeeAmount+sectionDeliveryFee−deliveryDiscountAmount, packageNumber 묶음당 1회만 계산(#2251). 조건부 무료배송 주문을 부분 취소하면 사후 부과로 값이 바뀜 |
| `sectionDeliveryFee` | 지역별 추가 배송비 | integer |  |  |
| `deliveryDiscountAmount` | 배송비 최종 할인액 | integer |  |  |
| `packageNumber` | 묶음배송 번호 | string |  | 같은 값이면 배송비를 한 번만 계산(#2251) |
| `shippingFeeType` | 배송비 형태(선불/착불/무료) | string |  | 착불 배송비는 결제·정산 금액에 들어가지 않음(#3641). 공식 값 목록 없음 |
| `deliveryPolicyType` | 배송비 정책(조건별 무료 등) | string |  | 공식 값 목록 없음 |
| `expectedDeliveryMethod` | 예정 배송 방법 | string |  | 코드 범례 = delivery.deliveryMethod |
| `expectedDeliveryCompany` | 주문 당시 상품에 설정된 택배사 | string |  | 2024-08-07 추가(#1876). 코드 범례 = delivery.deliveryCompany |
| `deliveryAttributeType` | 배송 속성 | string |  | NORMAL=일반배송, TODAY=오늘출발, OPTION_TODAY=옵션별 오늘출발, HOPE=희망일배송, TODAY_ARRIVAL=당일배송, DAWN_ARRIVAL=새벽배송, PRE_ORDER=예약구매, ARRIVAL_GUARANTEE=N배송, SELLER_GUARANTEE=N판매자배송, HOPE_SELLER_GUARANTEE=N희망일배송, PICKUP=픽업, QUICK=즉시배달. 2022-12-20 추가, 2024-03-21부터 N배송 외 주문에도 반환(#1556) |
| `deliveryTagType` | 배송 태그 | string |  | TODAY=오늘배송, TOMORROW=내일배송, DAWN=새벽배송, SUNDAY=일요배송, STANDARD=D+2 이상, HOPE=희망일배송. 일부 N배송·N희망일배송·N판매자배송 주문만. 2025-07-23 추가(#2729) |
| `shippingMemo` | 배송 메모 | string | purchases.purchase_memo |  |
| `logisticsCompanyId` | 물류사 코드 | string |  | 값이 있으면 풀필먼트 주문. 코드 범례 미제공(#329) |
| `logisticsCenterId` | 물류센터 코드 | string |  |  |
| `logisticsDirectContracted` | 물류 직계약 주문 여부 | boolean |  | 2025-10-01 추가(#2912). true면 NFA 물류사만 발주확인·발송 가능(#2887) |
| `freeGift` | 사은품 | string |  | 자유 텍스트 |
| `giftReceivingStatus` | 선물 수락 상태 | string | naver_product_orders.gift_receiving_status | WAIT_FOR_RECEIVING=수락 대기(배송지 입력 대기), RECEIVED=수락 완료. 값이 있으면 선물하기 주문(#15). 응답의 선물 전용 필드는 이것 하나 |
| `inflowPath` | 유입 경로 | string | naver_product_orders.inflow_path | 한글 텍스트(문서 예시: 검색광고(SA)/공동구매/밴드/네이버 쇼핑/네이버 쇼핑 외). 공식 값 목록 없음, 운영 중 바뀔 수 있어 참고용 권장(#3020). '네이버쇼핑 외'=외부 유입(#2843), 끝 공백 제보(#477) |
| `inflowPathAdd` | 유입 경로 추가 정보 | string |  | 2023-07-26 추가(#917). 별도 안내받은 판매자에게만 의미 있음(#1742) |
| `commissionRatingType` | 수수료 과금 구분 | string |  | 한글 값: 결제 수수료/(구)판매 수수료/채널 수수료 |
| `commissionPrePayStatus` | 수수료 선결제 상태 | string |  | GENERAL_PRD=일반 상품, PRE_PAY_PRD_NO_PAY=선차감(차감 전), PRE_PAY_PRD_PAYED=선차감(차감 후) |
| `paymentCommission` | 결제 수수료 | integer | naver_settlements.payment_commission |  |
| `saleCommission` | (구)판매 수수료 | integer | naver_settlements.sale_commission |  |
| `channelCommission` | 채널 수수료 | integer | naver_settlements.channel_commission |  |
| `knowledgeShoppingSellingInterlockCommission` | 네이버쇼핑 매출 연동 수수료 | integer | naver_settlements.shopping_interlock_commission |  |
| `expectedSettlementAmount` | 정산 예정 금액 | integer | naver_settlements.expected_settlement_amount |  |
| `individualCustomUniqueCode` | 구매자 개인통관고유부호 | string |  | 거래 종료(구매확정·교환·반품·취소·미결제취소) 주문에서는 노출 안 됨. 2026-10-28부터 일회용 부호 신규 필드와 병행(#3869) |
| `oneTimeIndividualCustomsCode` | 구매자 입력 일회용 개인통관고유부호 | string |  | PLANNED 2026-10-28 추가 예정, v2.90.1 문서에는 아직 없음. 해당 주문에만 유효, 거래 종료 시 미제공(#3869) |
| `oneTimeCertificationNo` | 일회용 개인통관고유부호 인증번호 | string |  | PLANNED 2026-10-28 추가 예정. individualCustomUniqueCode 또는 oneTimeIndividualCustomsCode와 짝으로 쓰임(#3869) |
| `shippingAddress` | 구매자 배송지 주소 | object |  | 하위 18개 필드는 productOrder.shippingAddress 그룹. 선물 수락 전에는 없을 수 있음(#15) |
| `takingAddress` | 판매자 출고지 주소 | object |  | 하위 11개: addressType, baseAddress, detailedAddress, zipCode, city, state, country, name, tel1, tel2, isRoadNameAddress(뜻은 shippingAddress 동명 필드와 같음). 출입·수령위치·좌표 필드는 없음 |
| `hopeDelivery` | 희망일배송 정보 | object |  | 하위 6개 필드는 productOrder.hopeDelivery 그룹 |
| `skuMappings` | 물류 재고(네이버 SKU) 매핑 | array<object> |  | 2025-04-16 추가(#2457). 네이버 SKU 연동 풀필먼트 주문만 |
| `appliedCoupons` | 적용 쿠폰 목록 | array<object> |  | 2026-01-21 추가(#3179) |
| `standardPurchaseOptions` | 그룹상품 판매 옵션 목록 | array<object> |  | 2026-03-18 추가(#3314) |
| `appliedCardPromotion` | 카드 프로모션 적용 정보 | object |  | 2026-03-04 추가(#3273) |

## productOrder.shippingAddress (18)

| 칸 | 뜻 | 형식 | 원장 칸 | 비고 |
|---|---|---|---|---|
| `addressType` | 배송지 타입 | string |  | DOMESTIC=국내, FOREIGN=국외 |
| `name` | 수취인 이름 | string |  | 거래 종료 61일 뒤 마스킹 대상으로 보이나 공지(#3116)에 필드 목록 없음 |
| `tel1` | 수취인 연락처 1 | string |  | 61일 마스킹 대상 여부는 공지에 명시 없음 |
| `tel2` | 수취인 연락처 2 | string |  |  |
| `zipCode` | 우편번호 | string |  |  |
| `baseAddress` | 기본 주소 | string |  |  |
| `detailedAddress` | 상세 주소 | string |  |  |
| `isRoadNameAddress` | 도로명 주소 여부 | boolean |  |  |
| `city` | 도시 | string |  | 국내 주소는 빈 문자열 |
| `state` | 주(state) | string |  | 국내 주소는 빈 문자열 |
| `country` | 국가 | string |  |  |
| `pickupLocationType` | 수령 위치 | string |  | FRONT_OF_DOOR=문 앞, MANAGEMENT_OFFICE=경비실 보관, DIRECT_RECEIVE=직접 수령, OTHER=기타. 장보기·일부 N배송류만. 2025-07-23 추가(#2729) |
| `pickupLocationContent` | 수령 위치 상세 | string |  | 장보기·일부 N배송류만. 2025-07-23 추가 |
| `entryMethod` | 출입 방법 | string |  | LOBBY_PW=공동현관 비밀번호, MANAGEMENT_OFFICE=경비실 호출, FREE=자유 출입, OTHER=기타. 2025-07-23 추가 |
| `entryMethodContent` | 출입 방법 상세 | string |  | 2025-07-23 추가 |
| `buildingManagementNo` | 건물 관리 번호 | string |  | 2025-02-19 추가, 일부 주문 유형만(#2318) |
| `longitude` | 경도 | string |  | 2025-02-19 추가, 일부 주문 유형만(#2318) |
| `latitude` | 위도 | string |  | 2025-02-19 추가, 일부 주문 유형만(#2318) |

## productOrder.hopeDelivery (6)

| 칸 | 뜻 | 형식 | 원장 칸 | 비고 |
|---|---|---|---|---|
| `region` | 희망배송 지역 | string |  |  |
| `additionalFee` | 희망배송 지역 추가 배송비 | integer |  |  |
| `hopeDeliveryYmd` | 배송 희망일 | string |  | yyyymmdd |
| `hopeDeliveryHm` | 배송 희망 시간 | string |  | HHmm |
| `changeReason` | 희망일 변경 사유 | string |  |  |
| `changer` | 희망일 변경자 | string |  | 한글 값: 구매회원/관리자/시스템/판매자/판매자API. 2026-08-05 설명 정정(#3686) |

## productOrder.skuMappings[] (3)

| 칸 | 뜻 | 형식 | 원장 칸 | 비고 |
|---|---|---|---|---|
| `nsId` | 네이버 SKU ID | string |  |  |
| `nsBarcode` | SKU 바코드 | string |  |  |
| `pickingQuantityPerOrder` | 주문당 피킹 수량 | integer |  |  |

## productOrder.appliedCoupons[] (4)

| 칸 | 뜻 | 형식 | 원장 칸 | 비고 |
|---|---|---|---|---|
| `couponPublishNumber` | 쿠폰 발행 번호 | string |  |  |
| `couponClassCode` | 쿠폰 유형 | string |  | NMP_PRD_DCNT=관리자 상품할인, NMP_PRD_DUP_DCNT=관리자/판매자 상품중복할인, SELLER_STORE_DCNT=스토어 할인 쿠폰(2026-03-18 추가, 2026-03-19 이후 주문만, #3314) |
| `couponDiscountAmount` | 쿠폰 할인 금액 | integer |  |  |
| `naverBurdenRatio` | 네이버 부담률 | integer |  |  |

## productOrder.standardPurchaseOptions[] (3)

| 칸 | 뜻 | 형식 | 원장 칸 | 비고 |
|---|---|---|---|---|
| `optionId` | 판매 옵션 ID | string |  |  |
| `optionName` | 판매 옵션 이름 | string |  |  |
| `valueName` | 판매 옵션 값 | string |  |  |

## productOrder.appliedCardPromotion (4)

| 칸 | 뜻 | 형식 | 원장 칸 | 비고 |
|---|---|---|---|---|
| `promotionName` | 카드 프로모션 이름 | string |  |  |
| `cardCompanyName` | 카드사 이름 | string |  |  |
| `promotionApplyAmount` | 프로모션 혜택 금액 | integer |  |  |
| `brandCompanyBurdenRatio` | 판매자(가맹점) 분담 비율 | integer |  |  |

## delivery (10)

| 칸 | 뜻 | 형식 | 원장 칸 | 비고 |
|---|---|---|---|---|
| `deliveryMethod` | 배송 방법 | string |  | DELIVERY=택배·등기·소포, GDFW_ISSUE_SVC=굿스플로 송장 출력, VISIT_RECEIPT=방문 수령, DIRECT_DELIVERY=직접 전달, QUICK_SVC=퀵서비스, NOTHING=배송 없음, RETURN_DESIGNATED=지정 반품 택배, RETURN_DELIVERY=일반 반품 택배, RETURN_INDIVIDUAL=직접 반송, RETURN_MERCHANT=판매자 직접 수거(장보기 전용, #2226), UNKNOWN=알 수 없음 |
| `deliveryCompany` | 택배사 코드 | string |  | 200여 종 범례(CJGLS=CJ대한통운, HYUNDAI=롯데택배, HANJIN=한진택배, KGB=로젠택배, EPOST=우체국택배 등). 수시 갱신(2025-11-26 FRESH→KURLY, #3027) |
| `trackingNumber` | 송장 번호 | string |  |  |
| `deliveryStatus` | 배송 상세 상태 | string |  | COLLECT_REQUEST=수거 요청, COLLECT_WAIT=수거 대기, COLLECT_CARGO=집화, DELIVERING=배송 중(2024-02-22 추가, #1495), DELIVERY_COMPLETION=배송 완료, DELIVERY_FAIL=배송 실패, WRONG_INVOICE=오류 송장, COLLECT_CARGO_FAIL=집화 실패, COLLECT_CARGO_CANCEL=집화 취소, NOT_TRACKING=배송 추적 없음 |
| `sendDate` | 발송 처리 일시 | string(date-time) |  | 2023-03-22 설명 수정(#547) |
| `pickupDate` | 집화 일시 | string(date-time) |  |  |
| `deliveredDate` | 배송 완료 일시 | string(date-time) |  |  |
| `isWrongTrackingNumber` | 오류 송장 여부 | boolean |  |  |
| `wrongTrackingNumberRegisteredDate` | 오류 송장 등록 일시 | string(date-time) |  |  |
| `wrongTrackingNumberType` | 오류 송장 사유 | string |  | 공식 값 목록 없음 |

## claim nodes (data[n]) (3)

| 칸 | 뜻 | 형식 | 원장 칸 | 비고 |
|---|---|---|---|---|
| `currentClaim` | 가장 최근 요청된 클레임 1건 | object |  | 하위에 cancel, return, exchange 중 해당 노드만 옴. 클레임 유형은 노드 이름이나 productOrder.claimType으로 판별(currentClaim에는 claimType 없음). 2024-07-24 추가(#1841) |
| `beforeClaim` | 처음 요청된 클레임(교환) | object |  | 교환 재배송 중 추가 반품/교환이 들어온 경우에만 옴. 하위는 exchange 하나. 2024-07-24 추가(#1841) |
| `completedClaims` | 완료된 클레임 이력 전체 | array<object> |  | 완료된 취소·반품·교환을 모두 담는 통합 스키마. 2024-10-10 추가(#2005). 해당 없는 필드는 null(#1773) |

## currentClaim.cancel (12)

| 칸 | 뜻 | 형식 | 원장 칸 | 비고 |
|---|---|---|---|---|
| `claimId` | 클레임 번호 | string |  | 요청별·상품주문번호별 고유(#1814) |
| `claimStatus` | 클레임 상태 | string |  | 코드 범례 = productOrder.claimStatus |
| `claimRequestDate` | 취소 요청 일시 | string(date-time) | naver_product_orders.claim_requested_at |  |
| `requestChannel` | 접수 채널 | string |  | 한글 값(예: 판매자API, #1775), 공식 목록 없음 |
| `requestQuantity` | 취소 요청 수량 | integer |  | 수량 클레임용, 2024-10-10 추가(#2005) |
| `cancelReason` | 취소 요청 사유 코드 | string |  | 공식 37종: INTENT_CHANGED=구매 의사 취소, COLOR_AND_SIZE=색상·사이즈 변경, WRONG_ORDER=다른 상품 잘못 주문, PRODUCT_UNSATISFIED=서비스 불만족, DELAYED_DELIVERY=배송 지연, SOLD_OUT=상품 품절, DROPPED_DELIVERY=배송 누락, NOT_YET_DELIVERY=미배송, BROKEN=상품 파손, INCORRECT_INFO=상품 정보 상이, WRONG_DELIVERY=오배송, WRONG_OPTION=다른 옵션 잘못 배송, SIMPLE_INTENT_CHANGED=단순 변심, MISTAKE_ORDER=주문 실수, ETC=기타(API 지정 불가), DELAYED_DELIVERY_BY_PURCHASER/INCORRECT_INFO_BY_PURCHASER/PRODUCT_UNSATISFIED_BY_PURCHASER(구매자 귀책 표기), NOT_YET_DISCUSSION=상호 협의 미완료, OUT_OF_STOCK=재고 부족, SALE_INTENT_CHANGED=판매 의사 변심, NOT_YET_PAYMENT=구매자 미결제, NOT_YET_RECEIVE=상품 미수취, WRONG_DELAYED_DELIVERY=오배송 및 지연, BROKEN_AND_BAD=파손 및 불량, RECEIVING_DUE_DATE_OVER=선물 수락 기한 만료, RECEIVER_MISMATCHED=수신인 불일치, GIFT_INTENT_CHANGED=선물 보내기 취소, GIFT_REFUSAL=선물 거절, MINOR_RESTRICTED/RECEIVING_BLOCKED=상품 수신 불가, UNDER_QUANTITY=주문 수량 미달, ASYNC_FAIL_PAYMENT/ASYNC_LONG_WAIT_PAYMENT=결제 승인 실패, FAMILY_PAY_REJECTED=패밀리결제 거절, BUSINESSMALL_PAY_REJECTED=관리자 결제 거절(2026-09-30 추가), FAIL_PAYMENT=결제 승인 실패(2026-09-30 추가, #3871). 귀책 구분은 #1170 |
| `cancelDetailedReason` | 취소 상세 사유 | string |  | 판매자가 입력하면 구매자에게 전달됨(#2080) |
| `cancelApprovalDate` | 취소 승인 일시 | string(date-time) |  |  |
| `cancelCompletedDate` | 취소 완료 일시 | string(date-time) | naver_product_orders.closed_at (취소 완료일 때) |  |
| `refundExpectedDate` | 환불 예정일 | string(date-time) |  |  |
| `refundStandbyStatus` | 환불 대기 상태 | string |  | 한글 값(예: 환불처리완료, #1775), 공식 목록 없음 |
| `refundStandbyReason` | 환불 대기 사유 | string |  |  |

## currentClaim.return / currentClaim.exchange (공통) (32)

| 칸 | 뜻 | 형식 | 원장 칸 | 비고 |
|---|---|---|---|---|
| `claimId` | 클레임 번호 | string |  |  |
| `claimStatus` | 클레임 상태 | string |  | 코드 범례 = productOrder.claimStatus |
| `claimRequestDate` | 반품·교환 요청 일시 | string(date-time) |  |  |
| `requestChannel` | 접수 채널 | string |  |  |
| `requestQuantity` | 반품·교환 요청 수량 | integer |  | 2024-10-10 추가 |
| `claimDeliveryFeeDemandAmount` | 반품·교환 배송비 청구액 | integer |  | 필드가 있으면 구매자 부담, 없으면 판매자 부담(#1170) |
| `claimDeliveryFeePayMeans` | 반품·교환 배송비 결제 수단 | string |  | 공식 값 목록 없음 |
| `claimDeliveryFeePayMethod` | 반품·교환 배송비 결제 방법 | string |  | 공식 값 목록 없음 |
| `claimDeliveryFeeDiscountAmount` | 반품·교환 배송비 할인액 | integer |  |  |
| `claimDeliveryFeeProductOrderIds` | 배송비 묶음 청구 상품주문번호 | string |  | 쉼표로 구분된 문자열 |
| `remoteAreaCostChargeAmount` | 도서산간 추가 비용 | integer |  | 2022-10-19 추가(#99) |
| `etcFeeDemandAmount` | 기타 비용 청구액 | integer |  |  |
| `etcFeePayMeans` | 기타 비용 결제 수단 | string |  |  |
| `etcFeePayMethod` | 기타 비용 결제 방법 | string |  |  |
| `collectAddress` | 구매자 수거지 주소 | object |  | 하위 11개: addressType, baseAddress, detailedAddress, zipCode, city, state, country, name, tel1, tel2, isRoadNameAddress |
| `returnReceiveAddress` | 판매자 반품·교환 수취지 주소 | object |  | 하위 12개: 주소 기본 11개 + logisticsCenterId |
| `collectStatus` | 수거 상태 | string |  | NOT_REQUESTED=수거 미요청, COLLECT_REQUEST_TO_AGENT=수거 지시 완료, COLLECT_REQUEST_TO_DELIVERY_COMPANY=수거 요청, COLLECT_WAITING=택배사 수거 예정, DELIVERING=수거 진행 중, DELIVERED=수거 완료, DELIVERY_FAILED=배송 실패, COLLECT_FAILED=수거 실패, WRONG_INVOICE=오류 송장, COLLECT_CANCELED=수거 취소 |
| `collectDeliveryMethod` | 수거 배송 방법 | string |  | 코드 범례 = delivery.deliveryMethod(실사용 RETURN_DESIGNATED/RETURN_DELIVERY/RETURN_INDIVIDUAL). 없으면 구매자 수거 단계 미완료(#2023) |
| `collectDeliveryCompany` | 수거 택배사 | string |  | 코드 범례 = delivery.deliveryCompany |
| `collectTrackingNumber` | 수거 송장 번호 | string |  |  |
| `collectCompletedDate` | 수거 완료 일시 | string(date-time) |  |  |
| `collectAttributeType` | N배송(FBN) 수거 속성 | string |  | LOGISTICS_COLLECT=NFA 수거, LOGISTICS_NON_COLLECT=NFA 미수거. 2026-07-22 추가(v2.83.0 #3646) |
| `holdbackStatus` | 보류 상태 | string |  | HOLDBACK=보류 중, RELEASED=보류 해제 |
| `holdbackReason` | 보류 유형 | string |  | RETURN_DELIVERYFEE=반품 배송비 청구, EXTRAFEEE=추가 비용 청구(철자 원문), RETURN_DELIVERYFEE_AND_EXTRAFEEE=반품 배송비+추가 비용, RETURN_PRODUCT_NOT_DELIVERED=반품 상품 미입고, ETC=기타, EXCHANGE_DELIVERYFEE=교환 배송비 청구, EXCHANGE_EXTRAFEE=추가 교환 비용 청구, EXCHANGE_PRODUCT_READY=교환 상품 준비 중, EXCHANGE_PRODUCT_NOT_DELIVERED=교환 상품 미입고, SELLER_CONFIRM_NEED=판매자 확인 필요, PURCHASER_CONFIRM_NEED=구매자 확인 필요, SELLER_REMIT=판매자 직접 송금. EXCHANGE_HOLDBACK, ETC2는 2026-08-05 범례에서 제거(#3686) |
| `holdbackDetailedReason` | 보류 상세 사유 | string |  |  |
| `holdbackConfigDate` | 보류 설정 일시 | string(date-time) |  |  |
| `holdbackConfigurer` | 보류 설정자 | string |  | 한글 값: 구매자/판매자/관리자/시스템 |
| `holdbackReleaseDate` | 보류 해제 일시 | string(date-time) |  |  |
| `holdbackReleaser` | 보류 해제자 | string |  | 한글 값: 구매자/판매자/관리자/시스템 |
| `membershipsArrivalGuaranteeClaimSupportingAmount` | 멤버십 N배송 무료 교환·반품 지원 금액(이전 필드) | integer |  | 2025-04-02 추가(#2433). 2025-07-23부터 claimDeliveryFeeSupportType/Amount 사용 권장(#2729). 실제 정산액과 다를 수 있음 |
| `claimDeliveryFeeSupportType` | 클레임 배송비 지원 유형 | string |  | MEMBERSHIP_ARRIVAL_GUARANTEE=멤버십 도착보장, MEMBERSHIP_KURLY=멤버십 컬리N마트. 2025-07-23 추가(#2729) |
| `claimDeliveryFeeSupportAmount` | 클레임 배송비 지원 금액 | integer |  | 2025-07-23 추가. 주문 시점 교환·반품 배송비 기준이라 실제 정산과 다를 수 있음(#2729) |

## currentClaim.return (7)

| 칸 | 뜻 | 형식 | 원장 칸 | 비고 |
|---|---|---|---|---|
| `returnReason` | 반품 요청 사유 코드 | string |  | 코드 범례 = currentClaim.cancel.cancelReason |
| `returnDetailedReason` | 반품 상세 사유 | string |  | 2026-07-08 최대 길이 정정(#3604) |
| `returnCompletedDate` | 반품 완료 일시 | string(date-time) | naver_product_orders.closed_at (반품 완료일 때) |  |
| `refundExpectedDate` | 환불 예정일 | string(date-time) |  |  |
| `refundStandbyStatus` | 환불 대기 상태 | string |  |  |
| `refundStandbyReason` | 환불 대기 사유 | string |  |  |
| `returnImageUrl` | 구매자 첨부 반품 상품 이미지 URL | array<string> |  | 2025-07-23 추가(#2729) |

## currentClaim.exchange (9)

| 칸 | 뜻 | 형식 | 원장 칸 | 비고 |
|---|---|---|---|---|
| `exchangeReason` | 교환 요청 사유 코드 | string |  | 코드 범례 = currentClaim.cancel.cancelReason |
| `exchangeDetailedReason` | 교환 상세 사유 | string |  |  |
| `reDeliveryMethod` | 재배송 방법 | string |  | 코드 범례 = delivery.deliveryMethod |
| `reDeliveryStatus` | 재배송 상태 | string |  | 코드 범례 = delivery.deliveryStatus |
| `reDeliveryCompany` | 재배송 택배사 | string |  | 코드 범례 = delivery.deliveryCompany |
| `reDeliveryTrackingNumber` | 재배송 송장 번호 | string |  |  |
| `reDeliveryOperationDate` | 재배송 처리 일시 | string(date-time) |  |  |
| `reDeliveryAddress` | 구매자 재배송지 주소 | object |  | 하위 11개 = 주소 기본 필드(collectAddress와 같음). 2024-10-10 추가, 2024-10-16 이후 데이터(#2005) |
| `exchangeImageUrl` | 구매자 첨부 교환 상품 이미지 URL | array<string> |  | 2025-07-23 추가(#2729) |

## claimAddress.returnReceiveAddress (1)

| 칸 | 뜻 | 형식 | 원장 칸 | 비고 |
|---|---|---|---|---|
| `logisticsCenterId` | 반품 상품을 받는 물류센터 ID | string |  | returnReceiveAddress에만 있음. 2024-07-10 추가, 풀필먼트 주문(#1815) |

## beforeClaim (1)

| 칸 | 뜻 | 형식 | 원장 칸 | 비고 |
|---|---|---|---|---|
| `exchange` | 처음 요청된 교환 클레임 | object |  | 스키마 = currentClaim.exchange(공통+교환 전용 필드 41개, 주소 3개 포함) |

## completedClaims[] (50)

| 칸 | 뜻 | 형식 | 원장 칸 | 비고 |
|---|---|---|---|---|
| `claimType` | 클레임 구분 | string |  | 코드 범례 = productOrder.claimType |
| `claimId` | 클레임 번호 | string |  |  |
| `claimStatus` | 클레임 상태 | string |  | 코드 범례 = productOrder.claimStatus |
| `claimRequestDate` | 클레임 요청 일시 | string(date-time) |  |  |
| `requestChannel` | 접수 채널 | string |  |  |
| `requestQuantity` | 클레임 요청 수량 | integer |  |  |
| `claimRequestReason` | 클레임 요청 사유 코드 | string |  | cancelReason/returnReason/exchangeReason에 대응(#1773). 코드 범례 = currentClaim.cancel.cancelReason(2026-09-30 추가 코드 포함, #3871) |
| `claimRequestDetailContent` | 클레임 상세 사유 | string |  | cancel/return/exchangeDetailedReason에 대응(#1773) |
| `claimRequestAdmissionDate` | 클레임 승인 일시 | string(date-time) |  | cancelApprovalDate에 대응, 반품·교환엔 해당 없음(#1773) |
| `claimCompleteOperationDate` | 클레임 완료 일시 | string(date-time) |  | 문서 설명은 '반품 완료일'이지만 cancelCompletedDate/returnCompletedDate에 대응, 교환엔 해당 없음(#1773) |
| `refundExpectedDate` | 환불 예정일 | string(date-time) |  |  |
| `refundStandbyStatus` | 환불 대기 상태 | string |  |  |
| `refundStandbyReason` | 환불 대기 사유 | string |  |  |
| `claimDeliveryFeeDemandAmount` | 클레임 배송비 청구액 | integer |  |  |
| `claimDeliveryFeePayMeans` | 클레임 배송비 결제 수단 | string |  |  |
| `claimDeliveryFeePayMethod` | 클레임 배송비 결제 방법 | string |  |  |
| `claimDeliveryFeeDiscountAmount` | 클레임 배송비 할인액 | integer |  |  |
| `claimDeliveryFeeProductOrderIds` | 배송비 묶음 청구 상품주문번호 | string |  | 쉼표 구분 |
| `remoteAreaCostChargeAmount` | 도서산간 추가 비용 | integer |  |  |
| `etcFeeDemandAmount` | 기타 비용 청구액 | integer |  |  |
| `etcFeePayMeans` | 기타 비용 결제 수단 | string |  |  |
| `etcFeePayMethod` | 기타 비용 결제 방법 | string |  |  |
| `collectAddress` | 구매자 수거지 주소 | object |  | 하위 11개 = 주소 기본 필드 |
| `returnReceiveAddress` | 판매자 반품·교환 수취지 주소 | object |  | 하위 12개 = 주소 기본 11개 + logisticsCenterId |
| `reDeliveryAddress` | 교환 재배송지 주소 | object |  | 하위 11개 = 주소 기본 필드. 2024-11-13 추가. 릴리즈노트(#2080)는 completedClaims[n].exchange.reDeliveryAddress로 적었으나 스키마상 위치는 completedClaims[n].reDeliveryAddress |
| `collectStatus` | 수거 상태 | string |  | 코드 범례 = currentClaim 공통 collectStatus |
| `collectDeliveryMethod` | 수거 배송 방법 | string |  | 코드 범례 = delivery.deliveryMethod |
| `collectDeliveryCompany` | 수거 택배사 | string |  | 코드 범례 = delivery.deliveryCompany |
| `collectTrackingNumber` | 수거 송장 번호 | string |  |  |
| `collectCompletedDate` | 수거 완료 일시 | string(date-time) |  |  |
| `collectOperationDate` | 수거(배송) 일자 | string |  | date-time이 아닌 8바이트 문자열. completedClaims에만 있음 |
| `collectStartTime` | 수거 시작 시간 | string |  | 8바이트 문자열. completedClaims에만 있음 |
| `collectEndTime` | 수거 종료 시간 | string |  | completedClaims에만 있음 |
| `collectSlotId` | 수거 슬롯 ID | string |  | completedClaims에만 있음 |
| `collectAttributeType` | N배송(FBN) 수거 속성 | string |  | LOGISTICS_COLLECT=NFA 수거, LOGISTICS_NON_COLLECT=NFA 미수거. 2026-07-22 추가(#3646) |
| `holdbackStatus` | 보류 상태 | string |  | HOLDBACK=보류 중, RELEASED=보류 해제 |
| `holdbackReason` | 보류 유형 | string |  | 코드 범례 = currentClaim 공통 holdbackReason(2026-08-05 정리본, #3686) |
| `holdbackDetailedReason` | 보류 상세 사유 | string |  |  |
| `holdbackConfigDate` | 보류 설정 일시 | string(date-time) |  |  |
| `holdbackConfigurer` | 보류 설정자 | string |  |  |
| `holdbackReleaseDate` | 보류 해제 일시 | string(date-time) |  |  |
| `holdbackReleaser` | 보류 해제자 | string |  |  |
| `reDeliveryMethod` | 재배송 방법 | string |  | 코드 범례 = delivery.deliveryMethod |
| `reDeliveryStatus` | 재배송 상태 | string |  | 코드 범례 = delivery.deliveryStatus |
| `reDeliveryCompany` | 재배송 택배사 | string |  | 코드 범례 = delivery.deliveryCompany |
| `reDeliveryTrackingNumber` | 재배송 송장 번호 | string |  |  |
| `reDeliveryOperationDate` | 재배송 처리 일시 | string(date-time) |  |  |
| `membershipsArrivalGuaranteeClaimSupportingAmount` | 멤버십 N배송 지원 금액(이전 필드) | integer |  | claimDeliveryFeeSupportAmount 사용 권장(#2729) |
| `claimDeliveryFeeSupportType` | 클레임 배송비 지원 유형 | string |  | MEMBERSHIP_ARRIVAL_GUARANTEE, MEMBERSHIP_KURLY |
| `claimDeliveryFeeSupportAmount` | 클레임 배송비 지원 금액 | integer |  |  |

## legacy claim (data[n]) (3)

| 칸 | 뜻 | 형식 | 원장 칸 | 비고 |
|---|---|---|---|---|
| `cancel` | 구 취소 클레임 노드 | object |  | DEPRECATED: 2026-10-28 응답에서 제거 → data[n].currentClaim.cancel(스키마 동일, #3608). 문서 스키마 설명엔 아직 '2025년 상반기 중 제거 예정'으로 남아 있음 |
| `return` | 구 반품 클레임 노드 | object |  | DEPRECATED: 2026-10-28 제거 → data[n].currentClaim.return(스키마 동일, #3608) |
| `exchange` | 구 교환 클레임 노드 | object |  | DEPRECATED: 2026-10-28 제거 → data[n].currentClaim.exchange 또는 data[n].beforeClaim.exchange(스키마 동일, #3608) |
