# Mesh Viewer Demo

웹 기반 3D 메시 뷰어 데모 애플리케이션입니다.

## 기능

- OBJ 파일 업로드 및 파싱
- 3D 메시 시각화
- 마우스를 이용한 3D 모델 조작 (회전, 줌, 패닝)
- 와이어프레임/솔리드 렌더링 모드 전환
- 조명 설정 조정

## 기술 스택

- **Frontend**: React, TypeScript, Three.js
- **Backend**: FastAPI, Python
- **Infrastructure**: Docker, Docker Compose

## 시작하기

### 사전 요구사항

- Docker 및 Docker Compose
- Node.js 18+ (로컬 개발 시)
- Python 3.11+ (로컬 개발 시)

### Docker를 이용한 실행

```bash
# 프로젝트 클론
git clone <repository-url>
cd mesh-viewer-demo

# Docker Compose로 실행
docker-compose up --build
```

애플리케이션이 다음 주소에서 실행됩니다:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API 문서: http://localhost:8000/docs

### 로컬 개발

#### Backend 설정

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### Frontend 설정

```bash
cd frontend
npm install
npm start
```

## 사용법

1. 웹 브라우저에서 http://localhost:3000 접속
2. "파일 선택" 버튼을 클릭하여 OBJ 파일 업로드
3. 업로드된 3D 모델을 마우스로 조작:
   - 좌클릭 드래그: 회전
   - 우클릭 드래그: 패닝
   - 휠: 줌 인/아웃
4. 렌더링 옵션을 조정하여 다양한 시각화 모드 체험

## API 문서

Backend API의 상세 문서는 서버 실행 후 http://localhost:8000/docs 에서 확인할 수 있습니다.

주요 엔드포인트:
- `POST /api/upload/mesh`: OBJ 파일 업로드
- `GET /api/mesh/{mesh_id}`: 메시 데이터 조회
- `GET /api/health`: 서버 상태 확인

## 프로젝트 구조

```
mesh-viewer-demo/
├── frontend/                 # React 애플리케이션
│   ├── src/
│   │   ├── components/      # React 컴포넌트
│   │   ├── services/        # API 서비스
│   │   ├── types/           # TypeScript 타입 정의
│   │   └── utils/           # 유틸리티 함수
│   ├── public/
│   └── package.json
├── backend/                  # FastAPI 애플리케이션
│   ├── app/
│   │   ├── api/            # API 라우터
│   │   ├── core/           # 핵심 설정
│   │   ├── models/         # 데이터 모델
│   │   ├── services/       # 비즈니스 로직
│   │   └── utils/          # 유틸리티 함수
│   └── requirements.txt
├── docker-compose.yml
└── README.md
```

## 개발 가이드라인

- **코드 스타일**: Prettier (Frontend), Black (Backend)
- **타입 검사**: TypeScript (Frontend), mypy (Backend)
- **테스트**: Jest (Frontend), pytest (Backend)
- **커밋 메시지**: Conventional Commits 규칙 준수

## 라이선스

MIT License

## 기여하기

1. 이 저장소를 포크합니다
2. 기능 브랜치를 생성합니다 (`git checkout -b feature/amazing-feature`)
3. 변경사항을 커밋합니다 (`git commit -m 'Add some amazing feature'`)
4. 브랜치에 푸시합니다 (`git push origin feature/amazing-feature`)
5. Pull Request를 생성합니다

Mesh Viewer Demo는 웹 기반 3D 메시 뷰어입니다.