"""업종별 메뉴명/설명 키워드 DB.

패턴(정규식 or 키워드) 매칭으로 자동 가안 생성.
업종 확장 시 이 파일만 추가/수정하면 됨.

구조:
    INDUSTRY_KEYWORDS[업종] = {
        "patterns": [...],          # 메뉴명 키워드 매칭 → 프리픽스/설명
        "desc_rules": [...],        # 설명문 보강 규칙
        "cpc_base": int,            # 업종 CPC 기본 단가
        "cpc_boosted": int,         # 단계적 상향 목표
        "customer_hurdle": str,     # 배달 소비자 허들 (솔루션 프레임)
    }
"""
from __future__ import annotations

import re
from typing import Pattern


def _c(pattern: str) -> Pattern:
    return re.compile(pattern)


# ─────────────────────────────────────────────
# 공용 패턴 (모든 업종 적용)
# ─────────────────────────────────────────────
UNIVERSAL_PATTERNS = [
    # 시즈널
    {"pattern": _c(r"냉모밀|콩국수|냉면|여름한정"), "prefix": "[시즈널·여름한정]"},
    # 1인/한그릇
    {"pattern": _c(r"1인|한그릇|혼자|솔로"), "prefix": "[1인 실속]"},
    # 세트
    {"pattern": _c(r"세트\b"), "prefix": "[푸짐 꿀조합]"},
    # 모짜치즈
    {"pattern": _c(r"모짜|모짜렐라|치즈스틱"), "prefix": "[모짜 쭉~ 시그니처]"},
]


# ─────────────────────────────────────────────
# 변주 키워드 DB (획일화 방지)
# 같은 카테고리 메뉴에 다른 특색 키워드를 부여하기 위한 서브 매칭
# 메뉴명 내부에 등장하는 하위 키워드 → 추가 설명 토큰
# ─────────────────────────────────────────────
VARIATION_KEYWORDS: list[dict] = [
    # 맵기
    {"pattern": _c(r"매콤|매운|마라|칠리|핫"), "token": "매콤한 풍미"},
    {"pattern": _c(r"순한|마일드|담백"), "token": "담백한 풍미"},
    # 재료 프로틴
    {"pattern": _c(r"베이컨"), "token": "스모키 베이컨"},
    {"pattern": _c(r"쉬림프|새우"), "token": "탱글한 쉬림프"},
    {"pattern": _c(r"트러플"), "token": "프리미엄 트러플 향"},
    {"pattern": _c(r"갈릭|마늘"), "token": "진한 갈릭"},
    {"pattern": _c(r"치즈|까망베르|파르메산|페코리노"), "token": "풍부한 치즈"},
    {"pattern": _c(r"관자|오징어|문어|랍스터|바닷가재"), "token": "프리미엄 해산물"},
    {"pattern": _c(r"소시지|프랑크|햄"), "token": "씹는 맛 소시지"},
    {"pattern": _c(r"버섯|트러플|포르치니"), "token": "향긋한 버섯"},
    {"pattern": _c(r"안심|등심|부채살|목살|삼겹"), "token": "두툼한 고기"},
    # 조리/포맷
    {"pattern": _c(r"리조또|리조또"), "token": "크리미 리조또"},
    {"pattern": _c(r"그라탕"), "token": "오븐에 구운"},
    {"pattern": _c(r"라자냐"), "token": "겹겹이 쌓은"},
    {"pattern": _c(r"뇨끼"), "token": "쫄깃한 뇨끼"},
    {"pattern": _c(r"펜네|리가토니|푸실리"), "token": "쇼트 파스타"},
    {"pattern": _c(r"링귀네"), "token": "납작한 링귀네"},
    # 볼륨/실속
    {"pattern": _c(r"하프|반반"), "token": "두 가지를 한 번에"},
    {"pattern": _c(r"왕|킹|자이언트|점보"), "token": "푸짐한 양"},
    # 감성
    {"pattern": _c(r"홈메이드|수제"), "token": "매장 직접"},
    {"pattern": _c(r"시그니처|대표"), "token": "대표 메뉴"},
    # 고레카레류 세부
    {"pattern": _c(r"치즈인 |치즈IN |치즈 인"), "token": "속 가득 치즈"},
    {"pattern": _c(r"로스|등심"), "token": "등심 부위"},
    {"pattern": _c(r"안심"), "token": "부드러운 안심"},
    {"pattern": _c(r"히레"), "token": "히레 부위 (안심)"},
    {"pattern": _c(r"카레라이스|카레밥"), "token": "밥 포함"},
    {"pattern": _c(r"오므|오믈렛"), "token": "폭신한 계란"},
    {"pattern": _c(r"돈부리"), "token": "덮밥 스타일"},
]


def match_variations(menu_name: str) -> list[str]:
    """메뉴명의 서브 키워드 → 변주 토큰 리스트 (차별화용)."""
    tokens = []
    for rule in VARIATION_KEYWORDS:
        if rule["pattern"].search(menu_name):
            tokens.append(rule["token"])
    return tokens


# ─────────────────────────────────────────────
# 업종별 DB
# ─────────────────────────────────────────────
INDUSTRY_KEYWORDS: dict[str, dict] = {
    # 돈까스·일식·카레 (고레카레 안성점 기준 리서치)
    "돈까스·회·일식": {
        "patterns": [
            {"pattern": _c(r"돈까스|돈카츠|카츠"), "prefix": "[바삭 통등심]",
             "desc_keywords": ["두툼한 통등심", "바삭한", "국내산 돼지고기"]},
            {"pattern": _c(r"치킨까스|치킨가스"), "prefix": "[통다리살 듬뿍]",
             "desc_keywords": ["통다리살 치킨까스", "두툼한"]},
            {"pattern": _c(r"가라아게"), "prefix": "[쫄깃 한입]",
             "desc_keywords": ["쫄깃한 쌀치킨 가라아게", "일본식 한입"]},
            {"pattern": _c(r"새우"), "prefix": "[통통 생새우]",
             "desc_keywords": ["통통한 생새우", "바삭한"]},
            {"pattern": _c(r"버섯"), "prefix": "[건강 버섯 3종]",
             "desc_keywords": ["양송이·새송이·느타리 3종 버섯", "깊은 맛"]},
            {"pattern": _c(r"크림카레"), "prefix": "[부드러운 리치]",
             "desc_keywords": ["부드러운 크림카레", "리치한 맛"]},
            {"pattern": _c(r"키마"), "prefix": "[정통 일본식]",
             "desc_keywords": ["갈아낸 소고기 듬뿍", "진한 일본 정통 키마 카레"]},
            {"pattern": _c(r"카레우동"), "prefix": "[현지의맛]",
             "desc_keywords": ["쫄깃한 우동", "진한 카레"]},
            {"pattern": _c(r"포크"), "prefix": "[입문 추천]",
             "name_replace": ("포크", "돼지고기"),
             "desc_keywords": ["부드러운 돼지고기"]},
            {"pattern": _c(r"볼카츠"), "prefix": "[볼륨감]",
             "name_replace": ("볼카츠", "함박볼카츠"),
             "desc_keywords": ["수제 함박볼카츠", "볼륨감 만점"]},
            {"pattern": _c(r"고레세트|시그니처|사장님 추천"), "prefix": "[푸짐 꿀조합]",
             "desc_keywords": ["시그니처 구성"]},
        ],
        "base_desc": "진한 일본 정통 카레",
        "cpc_base": 388,
        "cpc_boosted": 450,
        "customer_hurdle": "바삭함·양·재료 품질 신뢰도",
        "key_signal_keywords": ["바삭", "통등심", "모짜 쭉~", "정통", "수제"],
        "avg_repeat_pct": 22,  # 돈까스·일식 업종 평균 재주문률
    },

    # 양식/파스타 (파스타엔포크 안성점 대비)
    "양식": {
        "patterns": [
            {"pattern": _c(r"알리오올리오|알리오"), "prefix": "[정통 이탈리안]",
             "desc_keywords": ["통마늘 + 올리브오일", "간결한 풍미"]},
            {"pattern": _c(r"로제|로제소스"), "prefix": "[진한 로제]",
             "desc_keywords": ["토마토 + 크림의 밸런스", "부드럽게 진한"]},
            {"pattern": _c(r"크림파스타|크림소스|크림"), "prefix": "[리치 크림]",
             "desc_keywords": ["생크림 + 치즈", "리치한 맛"]},
            {"pattern": _c(r"토마토"), "prefix": "[홈메이드 토마토]",
             "desc_keywords": ["홈메이드 토마토 소스", "산뜻한 풍미"]},
            {"pattern": _c(r"까르보나라"), "prefix": "[정통 까르보나라]",
             "desc_keywords": ["계란 노른자 + 페코리노 치즈"]},
            {"pattern": _c(r"해산물|봉골레|새우|해물"), "prefix": "[통통 해산물]",
             "desc_keywords": ["신선한 해산물", "진한 해물 육수"]},
            {"pattern": _c(r"스테이크|스테이"), "prefix": "[프리미엄 스테이크]",
             "desc_keywords": ["두툼한 스테이크", "미디엄 레어 추천"]},
            {"pattern": _c(r"치즈볼|치즈스틱"), "prefix": "[모짜 쭉~ 시그니처]",
             "desc_keywords": ["쭉 늘어나는 모짜치즈"]},
            {"pattern": _c(r"샐러드"), "prefix": "[신선 샐러드]",
             "desc_keywords": ["신선한 야채", "홈메이드 드레싱"]},
        ],
        "base_desc": "정통 이탈리안 스타일",
        "cpc_base": 351,
        "cpc_boosted": 450,
        "customer_hurdle": "정통성·재료 품질·양",
        "key_signal_keywords": ["정통", "홈메이드", "리치", "프리미엄"],
        "avg_repeat_pct": 25,  # 양식·파스타 업종 평균 재주문률
    },

    # 치킨
    "치킨": {
        "patterns": [
            {"pattern": _c(r"후라이드|프라이드"), "prefix": "[바삭 기본]",
             "desc_keywords": ["바삭한 튀김옷", "부드러운 살"]},
            {"pattern": _c(r"양념"), "prefix": "[진한 양념]",
             "desc_keywords": ["달콤매콤 양념소스", "푸짐한 양"]},
            {"pattern": _c(r"간장"), "prefix": "[달콤 간장]",
             "desc_keywords": ["달콤짭짤 마늘간장"]},
            {"pattern": _c(r"순살"), "prefix": "[뼈없는]",
             "desc_keywords": ["부드러운 순살", "한입에 쏙"]},
            {"pattern": _c(r"치즈볼|치즈스틱"), "prefix": "[모짜 쭉~]",
             "desc_keywords": ["쭉 늘어나는 치즈"]},
        ],
        "base_desc": "든든한 치킨",
        "cpc_base": 388,
        "cpc_boosted": 450,
        "customer_hurdle": "맛·양·가성비",
        "key_signal_keywords": ["바삭", "양많은", "가성비"],
        "avg_repeat_pct": 30,  # 치킨 업종 평균 재주문률 (단골 비중 큼)
    },

    # 분식
    "분식": {
        "patterns": [
            {"pattern": _c(r"떡볶이"), "prefix": "[진짜 매운]",
             "desc_keywords": ["쫄깃한 떡", "진한 고추장"]},
            {"pattern": _c(r"순대"), "prefix": "[정통 순대]",
             "desc_keywords": ["쫄깃한 순대"]},
            {"pattern": _c(r"튀김"), "prefix": "[바삭]",
             "desc_keywords": ["바삭한 튀김옷"]},
            {"pattern": _c(r"김밥"), "prefix": "[푸짐]",
             "desc_keywords": ["재료 듬뿍"]},
        ],
        "base_desc": "분식 맛집",
        "cpc_base": 388,
        "cpc_boosted": 450,
        "customer_hurdle": "가성비·양",
        "key_signal_keywords": ["진짜", "푸짐", "가성비"],
        "avg_repeat_pct": 35,  # 분식 업종 평균 재주문률 (회전율 높음)
    },

    # ─────────────────────────────────────────────
    # 신규 업종 (2026-04 확장: 배달 수요 상위 업종 커버)
    # ─────────────────────────────────────────────

    # 중식 (짜장·짬뽕·탕수육 계열)
    "중식": {
        "patterns": [
            {"pattern": _c(r"짜장|자장"), "prefix": "[정통 수타]",
             "desc_keywords": ["수타로 뽑은 면", "깊은 춘장 풍미"]},
            {"pattern": _c(r"짬뽕"), "prefix": "[웍의 불맛]",
             "desc_keywords": ["센불에 볶아낸", "얼큰한 해물 육수"]},
            {"pattern": _c(r"탕수육"), "prefix": "[바삭 찹쌀]",
             "desc_keywords": ["바삭한 찹쌀 튀김", "새콤달콤 소스"]},
            {"pattern": _c(r"볶음밥"), "prefix": "[웍의 열기]",
             "desc_keywords": ["고슬한 밥알", "센불 볶음"]},
            {"pattern": _c(r"마라|마파"), "prefix": "[사천식]",
             "desc_keywords": ["얼얼한 마라 향", "사천 정통"]},
            {"pattern": _c(r"깐풍|유린|라조"), "prefix": "[셰프 특제]",
             "desc_keywords": ["중식 셰프 수제", "겉바속촉"]},
            {"pattern": _c(r"딤섬|만두"), "prefix": "[손수 빚은]",
             "desc_keywords": ["얇은 피", "육즙 가득"]},
        ],
        "base_desc": "정통 중화요리",
        "cpc_base": 320,
        "cpc_boosted": 388,
        "customer_hurdle": "양·불맛·정통성",
        "key_signal_keywords": ["정통 중화", "웍의 열기", "손수 볶음", "불맛"],
        "avg_repeat_pct": 30,  # 배달 단골 비중 중상 (짜장 등 고정 수요)
    },

    # 한식 (백반·찌개·국밥 계열)
    "한식": {
        "patterns": [
            {"pattern": _c(r"찌개"), "prefix": "[뚝배기 정성]",
             "desc_keywords": ["뚝배기에 끓여낸", "구수한 한식 정통"]},
            {"pattern": _c(r"국밥"), "prefix": "[푹 고아낸]",
             "desc_keywords": ["푹 고아낸 육수", "든든한 한 그릇"]},
            {"pattern": _c(r"백반|정식"), "prefix": "[집밥 한 상]",
             "desc_keywords": ["밑반찬 포함", "매일 조리 집밥"]},
            {"pattern": _c(r"불고기|제육"), "prefix": "[정성 가득]",
             "desc_keywords": ["양념에 재운", "팬에 바로 볶은"]},
            {"pattern": _c(r"비빔밥"), "prefix": "[나물 듬뿍]",
             "desc_keywords": ["갓 무친 나물", "참기름 향"]},
            {"pattern": _c(r"갈비|삼겹|등심"), "prefix": "[숯불향]",
             "desc_keywords": ["직화 숯불향", "두툼한 고기"]},
            {"pattern": _c(r"육개장|설렁탕|곰탕"), "prefix": "[진국]",
             "desc_keywords": ["깊고 진한 국물", "푹 우린"]},
        ],
        "base_desc": "정성 가득 한식",
        "cpc_base": 280,
        "cpc_boosted": 351,
        "customer_hurdle": "정성·밑반찬·집밥 신뢰도",
        "key_signal_keywords": ["정성 가득", "집밥", "뚝배기", "푹 고아낸"],
        "avg_repeat_pct": 28,  # 일상식 포지션, 동네 단골 비중
    },

    # 피자
    "피자": {
        "patterns": [
            {"pattern": _c(r"페퍼로니"), "prefix": "[클래식 페퍼로니]",
             "desc_keywords": ["얇게 저민 페퍼로니", "바삭 엣지"]},
            {"pattern": _c(r"포테이토|감자"), "prefix": "[포실 감자]",
             "desc_keywords": ["포슬한 감자", "크림 소스"]},
            {"pattern": _c(r"불고기|갈비"), "prefix": "[한국식]",
             "desc_keywords": ["달콤짭짤 불고기", "두툼한 토핑"]},
            {"pattern": _c(r"쉬림프|새우|씨푸드|해산물"), "prefix": "[통통 해산물]",
             "desc_keywords": ["탱글한 새우", "해산물 듬뿍"]},
            {"pattern": _c(r"고르곤졸라|블루치즈"), "prefix": "[리치 치즈]",
             "desc_keywords": ["꿀 찍어먹는", "향긋한 블루치즈"]},
            {"pattern": _c(r"콤비네이션|슈프림"), "prefix": "[모두의 취향]",
             "desc_keywords": ["다채로운 토핑", "든든한 한 판"]},
            {"pattern": _c(r"도우|씬|씨크"), "prefix": "[수제 도우]",
             "desc_keywords": ["매일 반죽한 도우", "쫄깃+바삭"]},
        ],
        "base_desc": "오븐에 구운 피자",
        "cpc_base": 450,
        "cpc_boosted": 550,
        "customer_hurdle": "도우 품질·토핑 양·가성비",
        "key_signal_keywords": ["수제 도우", "오븐에 구운", "모짜 쭉~", "매일 반죽"],
        "avg_repeat_pct": 22,  # 가족·모임 수요, 단독 소비 빈도 낮음
    },

    # 버거·샌드위치
    "버거·샌드위치": {
        "patterns": [
            {"pattern": _c(r"버거|햄버거"), "prefix": "[수제 패티]",
             "desc_keywords": ["100% 비프 패티", "육즙 가득"]},
            {"pattern": _c(r"치즈버거"), "prefix": "[쭉 늘어나는]",
             "desc_keywords": ["두툼한 패티", "녹진한 치즈"]},
            {"pattern": _c(r"베이컨"), "prefix": "[스모키]",
             "desc_keywords": ["바삭한 베이컨", "짭짤 스모키"]},
            {"pattern": _c(r"치킨버거|치킨"), "prefix": "[바삭 필레]",
             "desc_keywords": ["통 치킨 필레", "바삭한 튀김옷"]},
            {"pattern": _c(r"샌드위치|토스트"), "prefix": "[든든한 한끼]",
             "desc_keywords": ["갓 구운 빵", "신선한 채소"]},
            {"pattern": _c(r"클럽|BLT|블티"), "prefix": "[정통 클럽]",
             "desc_keywords": ["3단 빵", "풍성한 속재료"]},
            {"pattern": _c(r"감자|프라이|후렌치"), "prefix": "[겉바속촉]",
             "desc_keywords": ["바삭한 감자튀김"]},
        ],
        "base_desc": "수제 스타일 버거·샌드위치",
        "cpc_base": 380,
        "cpc_boosted": 450,
        "customer_hurdle": "패티 품질·양·번 신선도",
        "key_signal_keywords": ["수제 패티", "100% 비프", "갓 구운", "육즙"],
        "avg_repeat_pct": 24,  # 간편식 포지션, 중간 정도
    },

    # 카페·디저트
    "카페·디저트": {
        "patterns": [
            {"pattern": _c(r"아메리카노|에스프레소"), "prefix": "[스페셜티]",
             "desc_keywords": ["스페셜티 원두", "균형 잡힌 바디"]},
            {"pattern": _c(r"라떼"), "prefix": "[고소한 라떼]",
             "desc_keywords": ["벨벳 폼", "고소한 우유"]},
            {"pattern": _c(r"케이크"), "prefix": "[매일 당일 제조]",
             "desc_keywords": ["매일 제조", "촉촉한 시트"]},
            {"pattern": _c(r"크로플|크로와상"), "prefix": "[겉바속촉]",
             "desc_keywords": ["바삭한 겉면", "버터 풍미"]},
            {"pattern": _c(r"빙수"), "prefix": "[여름한정]",
             "desc_keywords": ["눈꽃 얼음", "시원한 한 그릇"]},
            {"pattern": _c(r"스무디|에이드|쉐이크"), "prefix": "[시즌 추천]",
             "desc_keywords": ["시원한 한 잔", "과일 듬뿍"]},
            {"pattern": _c(r"쿠키|마카롱|스콘"), "prefix": "[홈베이킹]",
             "desc_keywords": ["매일 구운", "수제 베이킹"]},
        ],
        "base_desc": "매일 직접 만드는 카페·디저트",
        "cpc_base": 200,
        "cpc_boosted": 288,
        "customer_hurdle": "신선도·비주얼·가격대",
        "key_signal_keywords": ["매일 제조", "스페셜티", "홈베이킹", "당일"],
        "avg_repeat_pct": 35,  # 카페 단골 비중 높음 (루틴 소비)
    },

    # 족발·보쌈
    "족발·보쌈": {
        "patterns": [
            {"pattern": _c(r"족발"), "prefix": "[쫄깃 족발]",
             "desc_keywords": ["한방 육수에 푹 삶은", "쫄깃 쫀득"]},
            {"pattern": _c(r"보쌈"), "prefix": "[부드러운 수육]",
             "desc_keywords": ["부드럽게 삶아낸", "담백한 수육"]},
            {"pattern": _c(r"막국수"), "prefix": "[시원한]",
             "desc_keywords": ["시원한 육수", "쫄깃한 메밀"]},
            {"pattern": _c(r"불족|매운족"), "prefix": "[진짜 매운]",
             "desc_keywords": ["매콤한 양념", "중독성 있는 맛"]},
            {"pattern": _c(r"세트|한상"), "prefix": "[푸짐 꿀조합]",
             "desc_keywords": ["푸짐한 구성", "모임 추천"]},
            {"pattern": _c(r"쟁반"), "prefix": "[풍성한]",
             "desc_keywords": ["넓은 쟁반", "푸짐한 상차림"]},
        ],
        "base_desc": "한방 육수로 삶은 정통 족발·보쌈",
        "cpc_base": 350,
        "cpc_boosted": 451,
        "customer_hurdle": "잡내 제거·고기 품질·양",
        "key_signal_keywords": ["한방", "쫄깃", "부드럽게 삶아낸", "푸짐"],
        "avg_repeat_pct": 25,  # 모임·회식 중심, 단골 중간
    },

    # 야식·안주
    "야식·안주": {
        "patterns": [
            {"pattern": _c(r"곱창|막창|대창"), "prefix": "[고소한 곱]",
             "desc_keywords": ["손질한 곱창", "고소한 곱"]},
            {"pattern": _c(r"닭발|닭똥집"), "prefix": "[매운 야식]",
             "desc_keywords": ["매콤한 양념", "쫄깃한 식감"]},
            {"pattern": _c(r"꼬치|야키도리"), "prefix": "[숯불향]",
             "desc_keywords": ["직화 숯불", "짭짤한 양념"]},
            {"pattern": _c(r"골뱅이|소면"), "prefix": "[매콤 안주]",
             "desc_keywords": ["쫄깃한 골뱅이", "매콤 새콤"]},
            {"pattern": _c(r"오징어|쥐포|먹태"), "prefix": "[술안주 제격]",
             "desc_keywords": ["쫄깃한 해산물", "맥주 페어링"]},
            {"pattern": _c(r"파전|전|부침"), "prefix": "[겉바속촉]",
             "desc_keywords": ["바삭한 겉면", "쫄깃한 속"]},
            {"pattern": _c(r"치즈볼|치즈스틱"), "prefix": "[모짜 쭉~]",
             "desc_keywords": ["쭉 늘어나는 치즈"]},
        ],
        "base_desc": "야심한 밤에 딱 좋은 야식·안주",
        "cpc_base": 330,
        "cpc_boosted": 451,
        "customer_hurdle": "맥주 페어링·양·매운맛 차별화",
        "key_signal_keywords": ["매콤", "숯불향", "쫄깃", "술안주"],
        "avg_repeat_pct": 30,  # 야간 고정 수요
    },

    # 아시안 (베트남·태국·인도 등)
    "아시안": {
        "patterns": [
            {"pattern": _c(r"쌀국수|포\b|보분"), "prefix": "[정통 베트남]",
             "desc_keywords": ["12시간 우린 육수", "신선한 고수·숙주"]},
            {"pattern": _c(r"팟타이|분짜"), "prefix": "[정통 동남아]",
             "desc_keywords": ["타마린드 소스", "현지의 맛"]},
            {"pattern": _c(r"커리|카레|치킨티카"), "prefix": "[인도 향신료]",
             "desc_keywords": ["정통 마살라", "진한 향신료"]},
            {"pattern": _c(r"똠얌|톰얌"), "prefix": "[매콤 새콤]",
             "desc_keywords": ["매콤 새콤 레몬그라스", "태국 정통"]},
            {"pattern": _c(r"반미|스프링롤|월남쌈"), "prefix": "[신선 한입]",
             "desc_keywords": ["얇은 라이스페이퍼", "신선한 채소"]},
            {"pattern": _c(r"나시|나시고랭|미고랭"), "prefix": "[인도네시아]",
             "desc_keywords": ["간장 베이스 볶음", "현지의 맛"]},
            {"pattern": _c(r"비리야니|난\b|탄두리"), "prefix": "[인도 정통]",
             "desc_keywords": ["인도 향신료", "탄두르 화덕"]},
        ],
        "base_desc": "현지의 맛 그대로 아시안 요리",
        "cpc_base": 300,
        "cpc_boosted": 388,
        "customer_hurdle": "정통성·향신료 거부감 해소·현지 재료",
        "key_signal_keywords": ["현지의 맛", "정통", "12시간 우린", "향신료"],
        "avg_repeat_pct": 20,  # 신규 카테고리 특성, 재주문률 낮은 편
    },
}

# 업종 매칭 실패 시 사용할 디폴트 평균 재주문률
DEFAULT_AVG_REPEAT_PCT = 25


def get_industry(cuisine: str) -> dict | None:
    """업종 키워드 DB 조회. 정확 일치 우선, 부분 일치 fallback."""
    if cuisine in INDUSTRY_KEYWORDS:
        return INDUSTRY_KEYWORDS[cuisine]
    # 부분 일치 (예: "돈까스·회·일식" in "돈까스")
    for key in INDUSTRY_KEYWORDS:
        parts = [p.strip() for p in key.replace("·", "/").split("/")]
        for p in parts:
            if p in cuisine:
                return INDUSTRY_KEYWORDS[key]
    return None


def match_patterns(menu_name: str, industry_db: dict) -> list[dict]:
    """메뉴명에 매칭되는 패턴 전체 반환 (여러 개 가능)."""
    matched = []
    # 업종 특화 먼저
    for rule in industry_db.get("patterns", []):
        if rule["pattern"].search(menu_name):
            matched.append(rule)
    # 공용
    for rule in UNIVERSAL_PATTERNS:
        if rule["pattern"].search(menu_name):
            matched.append(rule)
    return matched


def apply_name_replacements(name: str, matches: list[dict]) -> str:
    """매칭된 규칙에 따라 메뉴명 치환."""
    result = name
    for m in matches:
        if "name_replace" in m:
            old, new = m["name_replace"]
            result = result.replace(old, new)
    return result
