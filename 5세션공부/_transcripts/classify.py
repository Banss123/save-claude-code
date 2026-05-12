#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Classify 170 YouTube sessions into 대분류/소분류 and output JSON."""
import json
import re

# Raw playlist data from yt-dlp
RAW = """001 | Session 159 : 시장크기는 큰데, 왜 성장을 못할까 | https://youtu.be/5ESggNo7Dug
002 | Session 160 : 상품이 아닌 맥락을 시장 진입구로 사용하는 법 | https://youtu.be/Moy7wj7Tln8
003 | Session 158 : 두번째 상품/서비스를 조심하라 | https://youtu.be/coe2-9XR4Uo
004 | Session 157 : 게임의 규칙을 만들어라 | https://youtu.be/g0Sj1c76Jto
005 | Session 156 : 네러티브를 설계하라 | https://youtu.be/CZoPWXpvJ9M
006 | Session 154 : 언더독으로 시장에 진입하는 방법 | https://youtu.be/tUHi_dweNaA
007 | 설날 특집 : 규칙은 가치를 만든다 | https://youtu.be/p6CbBiWxzyk
008 | Session 153 : 전환비용 Switching Cost | https://youtu.be/bTX5KOzXRMc
009 | Session 152 : 전략적 해자 | https://youtu.be/lU-cPAnMgkY
010 | Session 151 : CVO 전략 | https://youtu.be/HXK3EQYIyR4
011 | 따종디엔핑 세션(26.01.27) | https://youtu.be/VCuhUyxp4bQ
012 | Session 150 : 내 가격을 신뢰할 수 있게 만드는 방법 | https://youtu.be/i9cfuqtjQVI
013 | Session 149 | 뉴오더 전용 SaaS , MMS | https://youtu.be/Q1h62gWptmQ
014 | Session 148 : 락인 전략 | https://youtu.be/tr_8TFvWPgg
015 | Session 147 : 시장 크기를 정확히 구분하라 | https://youtu.be/wPqvhULXlVg
016 | Session 146 : ARPU 상승전략 | https://youtu.be/mEnMIy2aah8
017 | Session 145 : 사업을 가장 쉽게 시작하는 법 - 아웃소싱 전략 | https://youtu.be/d-bZ1In8BR4
018 | Session 144 : 사업을 확장시킬 때, 점검하여야 하는 것들 | https://youtu.be/6e831AztM2g
019 | Session 143 : 기존 자산을 살리는 피벗 전략 | https://youtu.be/QmvnO0iQwzI
020 | Session 142 : 의사결정의 피로를 전가하지 마라 | https://youtu.be/j4GryFPyAhA
021 | Session 141 : 고객은 왜 이탈하는가 - LTV 하락 요인 점검 | https://youtu.be/adhOreWtyh0
022 | Session 140 : 시장 속 고객의 욕망을 찾아내는 법 | https://youtu.be/cIK79MpR_Io
023 | Session 139 : 경쟁이 치열한 시장에 진입하는 법 | https://youtu.be/S9vodzoM6LE
024 | Session 138 : 팔기 쉬운 시장, 팔 수 없는 시장 | https://youtu.be/_jsK71d5tXA
025 | Session 137 : 내 사업은 지금 어느구간에 있는가? | https://youtu.be/PWY1yhSPKgA
026 | Session 136 : 10년을 영위할 수 있는 사업의 본질 | https://youtu.be/q-zkZ8ZG5K4
027 | 추석 시즌 번외 세션 : 여자를 맵핑하는 방법 | https://youtu.be/sWn1Fz7HiDU
028 | Session 135 : 영업의 흐름을 설계하는 법 | https://youtu.be/dRu7bu1F0bA
029 | Session 134 : CRM과 자동화 | https://youtu.be/mEBVsiDCktA
030 | Session 133 : GAP SELLING | https://youtu.be/RUSKclavBKg
031 | Session 132 : Pain Point | https://youtu.be/Qy5eZXfYSD8
032 | Session 131 : 영업의 성공가능성을 판단하는 법 | https://youtu.be/Ph6kWasyMXI
033 | Session 130 : 스핀 셀링 | https://youtu.be/p0y1-z6fz8Q
034 | Session 129 : 북극성 지표 | https://youtu.be/c5jR-JnX1Z0
035 | Session 128 : 의사결정 구조 | https://youtu.be/lj9wnY5nxo8
036 | Session 127 : 심리적 저항을 해소하는 마케팅 전략 | https://youtu.be/VjyMxMTVv7k
037 | Session 125 : 고객생애가치를 상승 시키는 법 | https://youtu.be/UzRs_p_QJuw
038 | Session 124 : 무에서 창업하기 | https://youtu.be/VUbWakweVlE
039 | Session 123 : 내 사업의 핵심지표는 무엇인가? | https://youtu.be/igsZvoLJNSI
040 | Session 122 : 왜 창업 아이디어의 90%는 실패하는가? | https://youtu.be/FIN0BJGK6dQ
041 | Session 121 : PMF 이후 사업의 확장 방법 | https://youtu.be/w7yxyyhVt2I
042 | Session 120 : 마케팅에도 플라이휠이 있다 | https://youtu.be/e_Hq4lKiFa8
043 | Session 118 : 사업을 설계함에도 구조가 있다 | https://youtu.be/WpVpu48a3Vk
044 | Session 117 : 포지셔닝에 대한 이해 | https://youtu.be/KFEvHt5rFDQ
045 | Session 116 : 시장을 제대로 세분화 하라 | https://youtu.be/tVfz2TnTEoQ
046 | Session 115 : 매출이 계속 성장하는법 | https://youtu.be/7OMRInIwzUY
047 | Session 114 : 사업에 프레임을 형성하라 | https://youtu.be/8jdneedBXJQ
048 | Session 113 : 사업은 비싸게 반복적으로 판매해야한다. | https://youtu.be/JVZP2kAYN7A
049 | 세션 112 : 잘 팔리는 구조는 따로있다. | https://youtu.be/bruJSMVeFb8
050 | Session 111 : 트래픽과 구매전환율 | https://youtu.be/diOSacnh83U
051 | 2025 04 06 21 01 29 신규 프로젝트 유튜브 상위 노출 서비스 | https://youtu.be/SqQHgpbsBzI
052 | Session 110 | 소비는 어떻게 만들어지는가 | https://youtu.be/EJEIE5Q278Y
053 | Session 109 : 어떤 스토리로 전술을 펼칠 것인가? | https://youtu.be/fajg_aRRjj8
054 | Session 108 : 선정된 시장에서의 전략과 전술 | https://youtu.be/0qG3vagLaqk
055 | Session 107 : B2B 마케팅 전략 | https://youtu.be/lCRhlNNxGKg
056 | Session 106 STP로 보는 마케팅 | https://youtu.be/VPx-TmEMGMY
057 | 세션 105 : 사업/마케팅적 프레임워크란? | https://youtu.be/_SdGNne7iTk
058 | Session 104 : 제대로된 마케팅 및 사업의 관점 | https://youtu.be/aZIsZMCB_lw
059 | Session 103 | DB 수집 | https://youtu.be/mIOXkabFAa4
060 | Session 102 : 자원이란 무엇인가? | https://youtu.be/rhgCGU5IP2c
061 | 2025 01 26 21 07 31 프로젝트 당근 퍼널 구축 대행 서비스 | https://youtu.be/ow3FPEaqgqQ
062 | Session 101 : 행동경제학 ( 넛지이론 ) | https://youtu.be/aioiHugZQFE
063 | Session 100 : 마케팅 전략의 기초 | https://youtu.be/0P62oiuDRLo
064 | 2025 01 05 신규 프로젝트: 호랑이아저씨 + 훈시 | https://youtu.be/UEFy_aBb01E
065 | Session 98 l 창업의 기본기 (상권분석 2) | https://youtu.be/pxrX17cmYJ8
066 | Session 97 : 상권분석 | https://youtu.be/NY9Navx7pMI
067 | Session 96 : 고객획득비용 | https://youtu.be/pHCHtj3BDHo
068 | Session 95 : 고객획득 | https://youtu.be/ZUy0a768aBw
069 | Session 94 : 고객생애가치 | https://youtu.be/c8I6hC4TMRo
070 | Session 93 : 창업의 기본기 (가격 책정) | https://youtu.be/YFFi4TPLIaQ
071 | Session 92 : 창업의 기본기 ( 수익 창출 ) | https://youtu.be/oYMMiCmRhes
072 | 세션 91 : 창업의 기본기 (상품화의 심화단계) | https://youtu.be/4VvY3CZOXuw
073 | Session 90 : 창업의 기본기 (상품화) | https://youtu.be/6gvv2mlEqxQ
074 | Session 89 : 창업의 기본기 (시장 세분화) | https://youtu.be/rh5H5HXJ1vM
075 | 세션 88 : 시장에서 고객찾기 | https://youtu.be/GsmVFjRnFCI
076 | 세션 87 : CUO의 제대로된 확장 | https://youtu.be/SA8JLvywC0g
077 | 24.10.06 팬브릿지 공식 세션 | https://youtu.be/2o3Sve2tAAc
078 | 세션 86 : 사업 아이디어가 안떠올라요 (下) | https://youtu.be/nRht8wmZQbo
079 | Session 85 : 사업 아이디어가 안떠올라요(中) | https://youtu.be/jMScaFxIdSI
080 | Session 84 : 사업 아이디어가 안떠올라요 1편 | https://youtu.be/Fc-WHTKkJxA
081 | Session 83 : 카피라이팅의 핵심 | https://youtu.be/oRCeUgUBsMo
082 | Session 82 : 카피라이팅의 기본기 | https://youtu.be/1Ooq7MXKq7c
083 | 세션 81 : 한국의 PERSONAL BRANDING | https://youtu.be/ptgcdCP7UTY
084 | Session 80 : 설득의 전략 , 빅도미노 | https://youtu.be/r4gfZydHzTc
085 | Session 79 : 비싸서 안팔린다는 착각 | https://youtu.be/hzLCcbco2n0
086 | Session 78 : 내 사업은 잘 돌아가고 있는걸까? | https://youtu.be/kTY0Ov_5Cbs
087 | Session 77 : SNS 마케팅에서 놓치는 것들 | https://youtu.be/s2pLyxW2_l8
088 | Session 76 : SNS 마케팅 ㅣ 어떤 플랫폼을 이용할 것인가 | https://youtu.be/iFZm1GkOsGc
089 | 더망고 2기 | https://youtu.be/HgyoUl4hxBY
090 | Sesssion 75 : 체험단 사업 | https://youtu.be/28iW3LbyjSU
091 | Session 74 : 바이럴 마케팅은 어떻게 이뤄질까(기본기) | https://youtu.be/yHiKanjY2SY
092 | Session 73 : 나는 어떤 마케팅을 하고 있는가? | https://youtu.be/BPvFlQmDMho
093 | 세션 72 : 스토리는 어떻게 완성되는가 | https://youtu.be/02gB9f3aID8
094 | 2024 06 02 21 00 57 비즈하이 by Bigvit | https://youtu.be/c7TYyrODKCE
095 | Session 71 : 소셜 커런시를 만드는 법 | https://youtu.be/zC20LhCpDeo
096 | 24/5.12 품위.책임감 | https://youtu.be/JY_sQQYRvCY
097 | Session 70 : 인식을 활용하는 법 (2) | https://youtu.be/1dJgMQdD02o
098 | 세션 69 : 인식을 유지하는 법 | https://youtu.be/VOko_dICiSo
099 | Session 68 : 인식을 활용하는 법 | https://youtu.be/0nXML_ssrDI
100 | 2024 04 14 레린형님 세션 | https://youtu.be/GlVos4Pp7fk
101 | 세션 67 : 아이템에 대한 인식 | https://youtu.be/Ne_B3r952gA
102 | 세션 67 | 동경성의 확장 | https://youtu.be/3tjIxX3RU0M
103 | 영업세션(sell me this pen) | https://youtu.be/vVcbpevv-3g
104 | 2024_03_10 추측하지 말고 추적하라 (인스타크몽점령) | https://youtu.be/qAhcqbbmrSI
105 | Session 66 : 동경성 확보 | https://youtu.be/WecG9pmrLFc
106 | Session 65 : 브랜드와 동경성 | https://youtu.be/XEb-JVg5QsY
107 | 2024_02_11 인스타 gpt | https://youtu.be/AGKmoBYg_kA
108 | Session 64 : 카테고리 사용 사례 CUO | https://youtu.be/KNX63S3R8no
109 | Session 63 : 잘 팔리는 상품의 비밀 | https://youtu.be/PXjn7U2QRrc
110 | Session 62 : 사람들은 언제 돈을 쓰는가? | https://youtu.be/V6GsN1Nt_E8
111 | Session 61 : 성공적인 미팅을 위한 세일즈 전략 | https://youtu.be/Y2aXqGWT3Bg
112 | Session 60 : 법은 부자를 위해 존재한다 | https://youtu.be/xyFIuG-9V0U
113 | Session 59 : 다각화 전략 그리고 범위의 경제 | https://youtu.be/vwzPQqEm4rQ
114 | Session 58 : 커뮤니티 퍼널 | https://youtu.be/818JuC2E5iY
115 | 세션 59 | 도파민 도시 | https://youtu.be/ZqXkwZe-Wng
116 | Session 59 : Project 7 종합마케팅 - 당근 제휴 마케팅 | https://youtu.be/srpy7JhnygE
117 | 20231119 정규세션 투초이스 | https://youtu.be/g1nXHdHfNUw
118 | 20231203 세션3 | https://youtu.be/ELVVZtzuQFo
119 | 세션 56 : 세상은 어떻게 당신을 가난하게 만들고 있는가? | https://youtu.be/M0Wx6_Y7bIY
120 | Session 55 : 비단봉 전략 | https://youtu.be/Y7yQMVF-C9c
121 | Session 55 : ESG 경영전략 | https://youtu.be/XGwDJJQmXs4
122 | 2023/10/08 - 인간의 기질 , 숲을 보는 법 | https://youtu.be/HYfN_VHpPf8
123 | Session 52 : A2E | https://youtu.be/M2O2P3hYdhE
124 | Session 50 : 경제적 해자 | https://youtu.be/B-jcgs-F3yI
125 | Session 51 : 일행 | https://youtu.be/TVgjg29nXx8
126 | Session 49 : DATA MINING | https://youtu.be/Qr2t9gMZtYI
127 | Session 48 : 구독경제 시스템 | https://youtu.be/U08ylh_SZwo
128 | Session 47 | 범위의 경제 | https://youtu.be/shjP_VJw63c
129 | PROJECT 13. 1st SESSION (From.RAERIN) - 2023 08 13 21 05 | https://youtu.be/upAKI2A8_Fc
130 | Session 44 : 플라이휠 구축법 | https://youtu.be/JwCsdtjmVlg
131 | Session 43 | Web 3.0 | https://youtu.be/kU4ghtmjSa4
132 | Session 42 l Numbers game | https://youtu.be/ymvdYMyklSM
133 | Session 41 : 내 돈을 지킨다는 것은 무엇인가 | https://youtu.be/BTfzdrZjowY
134 | Session 39 : 사업의 꽃, 법인 | https://youtu.be/qEnl0hGqnZM
135 | Session 38 : 남의 능력으로 사업하라 / 뉴오더란 시스템은 무엇인가 | https://youtu.be/BnjMpo43OUw
136 | Session 37 : 눈 먼 돈을 버는 방법, 공제회 사업 | https://youtu.be/o0160t2Lf8g
137 | Session 36 : 슈퍼甲과 슈퍼乙 | https://youtu.be/e6UspqxyR1Y
138 | 세션 35 : 무슨 돈으로 사업할 것인가, 뱅크롤(하편) | https://youtu.be/Nlz1Nr-FaNk
139 | Session 34 : 무슨 돈으로 사업할 것인가 , 뱅크롤 전략 | https://youtu.be/sGNNpbuPx-g
140 | 2023/05/14 - Session33 마케팅 , 꽌시 전략 (중급) | https://youtu.be/gQ1MZOpz24s
141 | 2023/05/07 - 마케팅, 어떻게 팔것인가? | https://youtu.be/lna1IE28NgE
142 | 2023/4/30 - 협상의 기술 , 도전 전략 | https://youtu.be/4nnMvv8OLQI
143 | 2023-04-23 / 사업 영역 확장 下 | https://youtu.be/ROf2OFN93vA
144 | 2023 / 4 /8 - Project N 및 Q/A | https://youtu.be/tV7mwnLOxUc
145 | Session 28 : 남의 돈으로 사업하는 법 | https://youtu.be/PbE4Slr10Lg
146 | 2023/03/24 - Session 27 : 무에서 유로 가는 길 : 영업 | https://youtu.be/FumcD3hT0B8
147 | Session 26 : 창의력과 성공은 별개의 문제다 | https://youtu.be/ffPtYhGyqi4
148 | Session 25 : 어디서 장사할 것인가 ? 상권분석 초급편 | https://youtu.be/joXpVCl6n2o
149 | Session 24 : Network Business | https://youtu.be/tY4SkGKLJIk
150 | Session 23 : 예정된 성공 그리고 설계된 가난 | https://youtu.be/RoWgQdth9EY
151 | Session 22 : 프로젝트 11 및 PIE라는 허상 | https://youtu.be/6zKGp57uW9U
152 | Session 21 : 프로젝트11, 배민 컨설팅 | https://youtu.be/kXUEOA84Gi0
153 | Session 20 : 전략적 상호작용 | https://youtu.be/Dtk-Al0C8vg
154 | 세션 19 : 모든 사업은 곧 유통이다 | https://youtu.be/CLVbR8slpEs
155 | 세션 18 : 문화를 만들면 돈을 정복한다 | https://youtu.be/WrcLviBinEE
156 | Session 17, 거래는 대화를 시작하는 순간 시작된다 : 화술편 | https://youtu.be/RWuFtBo0wjg
157 | Session 16 : 돈의 공식 , 성공은 어떻게 학습되는가 | https://youtu.be/xId0R0sr_uw
158 | Session 15 | 과거에서 일을 하고 미래에서 돈을 벌어라 | https://youtu.be/nkMTt_CwbIU
159 | Session 14 | 사업 아이디어가 안떠올라요 | https://youtu.be/_8ZAJhFNG9c
160 | Session 13 : 회사가 회사원을 쓰는 이유 | https://youtu.be/W6nLnPuNC64
161 | Session 12 : 돈의 흐름을 잡아라 트라이앵글 비지니스 | https://youtu.be/VnS_DsyiyIY
162 | Session 11 : 앞으로 커질 수 밖에 없는 사업 : 인스타 관리대행 | https://youtu.be/GpTB3wK8PcA
163 | 2022/11/18 - 아이템을 팔리게 하는 마술 STORY | https://youtu.be/qDKuSZY4Ffk
164 | Session 9 : 부동산, 내집마련이라는 환상 | https://youtu.be/fH-9XV5ZRxE
165 | 11/4 - 성공 그리고 베트남 | https://youtu.be/9tg30auOG40
166 | Session 7 : 사업의 기본구조 / Project 5 | https://youtu.be/lidAHrgQ9Os
167 | Seesion 6 : 사업의 기본 브랜딩 | https://youtu.be/qBXpLCFO7g8
168 | Session 5 : 수산물유통 | https://youtu.be/E70Qa_-nnkg
169 | Session 3 : 공포를 이용하는 방법 | https://youtu.be/F-anQYGbKW4
170 | Session 2 : 세상에 돈은 공기만큼 많다 | https://youtu.be/v8BJM5JNHkA"""


# Manual overrides for tricky cases (index -> sub category)
OVERRIDES = {
    # index : "sub_category"
    3: "1.2 아이템 개발",       # 두번째 상품/서비스
    7: "2.1 전략·해자",          # 규칙은 가치
    13: "6. 번외/프로젝트",      # 뉴오더 SaaS
    17: "2.3 확장·피벗",         # 아웃소싱 전략
    26: "2.2 BM·구조",           # 10년 사업의 본질
    27: "6. 번외/프로젝트",      # 여자 맵핑
    36: "4.5 기본·원리",         # 심리적 저항 마케팅
    51: "6. 번외/프로젝트",      # 유튜브 상위노출 프로젝트
    52: "4.4 퍼널·전환",         # 소비는 어떻게
    53: "4.3 카피·스토리",       # 스토리로 전술
    60: "2.2 BM·구조",           # 자원이란
    61: "6. 번외/프로젝트",      # 당근 퍼널 프로젝트
    64: "6. 번외/프로젝트",      # 호랑이아저씨
    77: "6. 번외/프로젝트",      # 팬브릿지
    83: "4.2 브랜딩·인식",       # PERSONAL BRANDING
    86: "2.4 고객·지표",         # 사업 잘 돌아가
    89: "6. 번외/프로젝트",      # 더망고
    90: "6. 번외/프로젝트",      # 체험단 사업
    94: "6. 번외/프로젝트",      # 비즈하이
    95: "2.5 가격·수익",         # 소셜 커런시
    96: "5.2 멘탈·원칙",         # 품위.책임감
    100: "6. 번외/프로젝트",     # 레린형님
    103: "3.1 영업 방법론",      # sell me this pen
    104: "6. 번외/프로젝트",     # 추적하라 인스타크몽
    107: "6. 번외/프로젝트",     # 인스타 gpt
    110: "4.5 기본·원리",        # 언제 돈을 쓰는가
    112: "5.4 돈의 원리",        # 법은 부자
    115: "6. 번외/프로젝트",     # 도파민 도시
    116: "6. 번외/프로젝트",     # Project 7
    117: "6. 번외/프로젝트",     # 투초이스
    118: "6. 번외/프로젝트",     # 세션3
    119: "5.4 돈의 원리",        # 가난
    122: "5.2 멘탈·원칙",        # 인간의 기질
    125: "5.2 멘탈·원칙",        # 일행
    129: "6. 번외/프로젝트",     # PROJECT 13
    131: "6. 번외/프로젝트",     # Web 3.0
    136: "6. 번외/프로젝트",     # 공제회 사업
    143: "2.3 확장·피벗",        # 사업 영역 확장
    144: "6. 번외/프로젝트",     # Project N
    147: "5.2 멘탈·원칙",        # 창의력과 성공
    149: "2.2 BM·구조",          # Network Business
    150: "5.4 돈의 원리",        # 설계된 가난
    151: "6. 번외/프로젝트",     # 프로젝트 11
    152: "6. 번외/프로젝트",     # 프로젝트11 배민
    153: "3.2 협상·설득",        # 전략적 상호작용
    154: "2.2 BM·구조",          # 모든 사업은 유통
    155: "4.5 기본·원리",        # 문화를 만들면
    157: "5.4 돈의 원리",        # 돈의 공식
    158: "5.4 돈의 원리",        # 과거 일 미래 돈
    160: "5.2 멘탈·원칙",        # 회사원 쓰는 이유
    161: "2.2 BM·구조",          # 트라이앵글 비지니스
    162: "6. 번외/프로젝트",     # 인스타 관리대행 사업
    163: "4.3 카피·스토리",      # STORY
    164: "5.4 돈의 원리",        # 부동산 내집마련
    165: "6. 번외/프로젝트",     # 베트남
    168: "2.2 BM·구조",          # 수산물유통
}

# Keyword-based auto classification (fallback for non-overridden)
RULES = [
    # 1. 사업구상
    ("1.1 시장 분석", ["시장 크기", "시장크기", "시장을 제대로 세분화", "세분화", "고객의 욕망", "경쟁이 치열", "팔기 쉬운 시장", "어느구간"]),
    ("1.2 아이템 개발", ["상품이 아닌 맥락", "아이디어", "상품화", "시장에서 고객찾기", "카테고리 사용 사례", "잘 팔리는 상품"]),
    ("1.3 창업 기본", ["창업의 기본기", "상권분석", "무에서 창업", "어디서 장사", "창업 아이디어"]),
    # 2. 사업구조
    ("2.1 전략·해자", ["전략적 해자", "전환비용", "Switching Cost", "CVO", "락인", "포지셔닝", "프레임", "네러티브", "언더독", "게임의 규칙", "ESG", "비단봉", "경제적 해자", "전략과 전술"]),
    ("2.2 BM·구조", ["사업을 설계", "사업의 기본구조", "플라이휠", "구독경제", "범위의 경제", "A2E", "사업은 비싸게", "잘 팔리는 구조", "매출이 계속 성장", "사업의 본질"]),
    ("2.3 확장·피벗", ["PMF", "확장", "피벗", "다각화", "CUO의 제대로된 확장"]),
    ("2.4 고객·지표", ["고객생애가치", "LTV", "고객획득", "북극성", "핵심지표", "CRM", "이탈", "DB 수집", "DATA MINING", "ARPU"]),
    ("2.5 가격·수익", ["가격을 신뢰", "가격 책정", "수익 창출", "비싸서 안팔린다"]),
    # 3. 영업/협상
    ("3.1 영업 방법론", ["영업의", "GAP SELLING", "Pain Point", "스핀 셀링", "Numbers game", "세일즈 전략", "미팅", "무에서 유로 가는 길"]),
    ("3.2 협상·설득", ["설득의 전략", "빅도미노", "협상의 기술", "슈퍼甲"]),
    # 4. 마케팅/브랜딩
    ("4.1 SNS·인스타", ["SNS 마케팅"]),
    ("4.2 브랜딩·인식", ["브랜드와 동경성", "동경성 확보", "동경성의 확장", "인식을 활용", "인식을 유지", "아이템에 대한 인식", "기본 브랜딩"]),
    ("4.3 카피·스토리", ["카피라이팅", "스토리는 어떻게"]),
    ("4.4 퍼널·전환", ["트래픽과 구매전환", "커뮤니티 퍼널"]),
    ("4.5 기본·원리", ["마케팅에도 플라이휠", "B2B 마케팅", "STP로 보는", "마케팅적 프레임", "제대로된 마케팅", "행동경제학", "마케팅 전략의 기초", "바이럴 마케팅", "어떤 마케팅을 하고", "공포를 이용", "꽌시", "어떻게 팔것인가", "나는 어떤 마케팅"]),
    # 5. 조직/경영
    ("5.1 의사결정", ["의사결정"]),
    ("5.3 재무·법인", ["사업의 꽃, 법인", "돈을 지킨다", "뱅크롤", "돈으로 사업하"]),
    # 6. 번외
    ("6. 번외/프로젝트", ["따종", "설날 특집", "추석 시즌", "프로젝트"]),
]

MAIN_CATEGORY_MAP = {
    "1.1": "1. 사업구상", "1.2": "1. 사업구상", "1.3": "1. 사업구상",
    "2.1": "2. 사업구조", "2.2": "2. 사업구조", "2.3": "2. 사업구조", "2.4": "2. 사업구조", "2.5": "2. 사업구조",
    "3.1": "3. 영업/협상", "3.2": "3. 영업/협상",
    "4.1": "4. 마케팅/브랜딩", "4.2": "4. 마케팅/브랜딩", "4.3": "4. 마케팅/브랜딩", "4.4": "4. 마케팅/브랜딩", "4.5": "4. 마케팅/브랜딩",
    "5.1": "5. 조직/경영", "5.2": "5. 조직/경영", "5.3": "5. 조직/경영", "5.4": "5. 조직/경영",
    "6.": "6. 번외/프로젝트",
}

def classify(title, idx):
    if idx in OVERRIDES:
        sub = OVERRIDES[idx]
        if sub.startswith("6."):
            return "6. 번외/프로젝트", None
        prefix = sub.split(" ")[0]
        main = MAIN_CATEGORY_MAP.get(prefix, "6. 번외/프로젝트")
        return main, sub
    for sub, kws in RULES:
        for kw in kws:
            if kw in title:
                if sub.startswith("6."):
                    return "6. 번외/프로젝트", None
                prefix = sub.split(" ")[0]
                main = MAIN_CATEGORY_MAP.get(prefix, "6. 번외/프로젝트")
                return main, sub
    return "6. 번외/프로젝트", None


entries = []
for line in RAW.strip().split("\n"):
    # Split on first " | " for idx, last " | " for URL; middle is title
    first = line.find(" | ")
    last = line.rfind(" | ")
    if first == -1 or last == -1 or first == last:
        continue
    idx = int(line[:first].strip())
    title = line[first+3:last].strip()
    url = line[last+3:].strip()
    # extract video ID from URL
    vid = url.split("/")[-1]
    main, sub = classify(title, idx)
    entries.append({
        "idx": idx,
        "title": title,
        "url": url,
        "video_id": vid,
        "대분류": main,
        "소분류": sub,
    })

with open("C:/Users/반민성/.claude/세션공부/_transcripts/classified.json", "w", encoding="utf-8") as f:
    json.dump(entries, f, ensure_ascii=False, indent=2)

# Summary
from collections import Counter
mains = Counter(e["대분류"] for e in entries)
subs = Counter(e["소분류"] for e in entries if e["소분류"])
print(f"Total: {len(entries)}")
print("\n=== 대분류 ===")
for k, v in sorted(mains.items()):
    print(f"  {k}: {v}")
print("\n=== 소분류 ===")
for k, v in sorted(subs.items()):
    print(f"  {k}: {v}")
print(f"\n번외 (소분류 없음): {sum(1 for e in entries if not e['소분류'])}")
