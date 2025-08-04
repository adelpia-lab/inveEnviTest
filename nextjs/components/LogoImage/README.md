# LogoImage 컴포넌트

이미지 파일을 입력으로 받는 재사용 가능한 React 컴포넌트입니다.

## 기능

- 이미지 파일 경로를 props로 받아 표시
- 이미지 크기와 위치를 커스터마이징 가능
- 에러 처리 및 로딩 상태 관리
- TypeScript 지원

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `src` | `string` | - | 이미지 소스 경로 (필수) |
| `alt` | `string` | - | 이미지 대체 텍스트 (필수) |
| `className` | `string` | `''` | 추가 CSS 클래스명 |
| `style` | `React.CSSProperties` | `{}` | 추가 인라인 스타일 |
| `widthScale` | `number` | `1.03` | 너비 스케일 (103%) |
| `heightScale` | `number` | `1.03` | 높이 스케일 (103%) |
| `offsetScale` | `number` | `0.015` | 오프셋 스케일 (1.5%) |

## 사용 예시

### 기본 사용법
```jsx
import LogoImage from '/components/LogoImage/LogoImage';

<LogoImage 
  src="/img/adelLogo.png" 
  alt="Adel Logo" 
/>
```

### 커스터마이징된 사용법
```jsx
<LogoImage 
  src="/img/customLogo.png" 
  alt="Custom Logo" 
  className="custom-logo-class"
  widthScale={1.05}
  heightScale={1.05}
  offsetScale={0.02}
  style={{ borderRadius: '8px' }}
/>
```

### 다른 이미지 파일 사용
```jsx
<LogoImage 
  src="/img/banner.png" 
  alt="Banner Image" 
  widthScale={1.0}
  heightScale={1.0}
  offsetScale={0}
/>
```

## 스타일 특징

- `objectFit: 'cover'`: 이미지가 컨테이너를 완전히 덮도록 설정
- `position: 'absolute'`: 절대 위치로 배치
- `overflow: 'hidden'`: 컨테이너에서 넘치는 부분 숨김
- 기본적으로 103% 크기로 설정하여 약간의 오버플로우 효과 제공

## 에러 처리

이미지 로드 실패 시 콘솔에 에러 메시지를 출력합니다. 필요에 따라 `onError` 핸들러를 추가하여 기본 이미지나 플레이스홀더로 대체할 수 있습니다. 