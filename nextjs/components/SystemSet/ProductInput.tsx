// ProductInput.tsx
import React, { useState, useEffect } from 'react';
import { z } from 'zod';
import {
  TextField,
  Button,
  Box,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Alert
} from '@mui/material';

import CloseIcon from '@mui/icons-material/Close';
import { useIsClient } from '../../lib/useIsClient';

// Zod 스키마 정의
const productInputSchema = z.object({
  modelName: z.string()
    .length(8, '모델명은 8자리 숫자여야 합니다')
    .regex(/^\d{8}$/, '모델명은 8자리 숫자만 입력 가능합니다'),
  productNames: z.array(
    z.string()
      .length(6, '제품명은 6자리여야 합니다')
      .regex(/^[A-Z]{2}\d{4}$/, '제품명은 2자리 대문자 + 4자리 숫자 형식이어야 합니다')
  ).length(10, '제품명은 10개여야 합니다')
});

type ProductInputData = z.infer<typeof productInputSchema>;

// 기본값 정의
const MODEL_NAME_INIT = '61514540';
const PRODUCT_NAME_INIT = ['PL2222', 'PL2233', 'PL2244', 'PL2255', 'PL2266', 'PL2277', 'PL2288', 'PL2299', 'PL2300', 'PL2311'];

interface ProductInputProps {
  wsConnection?: WebSocket;
  onSave?: (data: ProductInputData) => void;
}

/**
 * 제품 입력 컴포넌트
 * 모델명(8자리 숫자)과 제품명(2자리 대문자 + 4자리 숫자) 10개를 입력받아 저장
 */
export default function ProductInput({ wsConnection, onSave }: ProductInputProps) {
  // 팝업창 열림/닫힘 상태
  const [open, setOpen] = useState(false);
  // 모델명 상태 - use default values to prevent hydration mismatch
  const [modelName, setModelName] = useState(MODEL_NAME_INIT);
  // 제품명 배열 상태 (10개 필드로 고정) - use default values to prevent hydration mismatch
  const [productNames, setProductNames] = useState<string[]>(PRODUCT_NAME_INIT);
  // 에러 상태
  const [error, setError] = useState<string | null>(null);
  // 저장 성공 상태
  const [isSaved, setIsSaved] = useState(false);
  // 로딩 상태
  const [isLoading, setIsLoading] = useState(false);
  const isClient = useIsClient();

  // Load stored values from localStorage only after client-side hydration
  useEffect(() => {
    if (!isClient) return;

    const getStoredProductInput = (): ProductInputData => {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('productInput');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            const result = productInputSchema.safeParse(parsed);
            if (result.success) {
              // console.log('💾 Loaded product input from localStorage:', parsed);
              return parsed;
            } else {
              console.warn('💾 Stored product input failed validation:', result.error);
            }
          } catch (error) {
            console.error('Failed to parse stored product input:', error);
          }
        }
      }
      
      // 기본값
      const defaultData: ProductInputData = {
        modelName: MODEL_NAME_INIT,
        productNames: PRODUCT_NAME_INIT
      };
      // console.log('💾 Using default product input:', defaultData);
      return defaultData;
    };

    const storedData = getStoredProductInput();
    setModelName(storedData.modelName);
    setProductNames(storedData.productNames);
  }, [isClient]);

  // WebSocket 메시지 수신 처리
  useEffect(() => {
    if (!wsConnection) return;

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      // console.log('📥 ProductInput received message:', message);

      // 서버에서 제품 입력 저장 확인 메시지 수신
      if (typeof message === 'string' && message.startsWith('[PRODUCT_INPUT_SAVED]')) {
        try {
          const match = message.match(/\[PRODUCT_INPUT_SAVED\] (.*)/);
          if (match && match[1]) {
            const savedData = JSON.parse(match[1]);
            // console.log('📥 Received product input save confirmation from server:', savedData);
            
            // 성공 상태 설정
            setIsSaved(true);
            // console.log('✅ Product input save confirmed by server');
            
            // 2초 후 팝업 닫기
            setTimeout(() => {
              handleClose();
            }, 2000);
          }
        } catch (error) {
          console.error('❌ Failed to parse product input save confirmation:', error);
        }
      }
      // 서버에서 초기 제품 입력 데이터 수신
      else if (typeof message === 'string' && message.startsWith('Initial product input:')) {
        try {
          const match = message.match(/Initial product input: (.*)/);
          if (match && match[1]) {
            // console.log("📥 Extracted JSON string:", match[1]);
            const initialData = JSON.parse(match[1]);
            // console.log('📥 Parsed initial product input:', initialData);
            
            const result = productInputSchema.safeParse(initialData);
            if (result.success) {
              // console.log('📥 Received valid initial product input from server:', initialData);
              
              // 서버에서 받은 초기 데이터로 상태 업데이트
              setModelName(initialData.modelName);
              setProductNames(initialData.productNames);
              
              // localStorage에도 저장
              if (typeof window !== 'undefined') {
                localStorage.setItem('productInput', JSON.stringify(initialData));
                // console.log('💾 Updated localStorage with server data:', initialData);
              }
              
              // 로딩 상태 해제
              setIsLoading(false);
              // console.log('✅ Initial product input loaded successfully from server');
                          } else {
                // console.log('❌ Server returned invalid product input, using default');
                setIsLoading(false);
              }
            } else {
              // console.log('❌ No initial product input found on server, using default');
              setIsLoading(false);
          }
        } catch (error) {
          console.error('❌ Failed to parse initial product input from server:', error);
          setIsLoading(false);
        }
      }
    };

    wsConnection.addEventListener('message', handleMessage);
    return () => wsConnection.removeEventListener('message', handleMessage);
  }, [wsConnection]);

  // 팝업창 열기 핸들러
  const handleClickOpen = () => {
    setOpen(true);
    setError(null);
    setIsSaved(false);
  };

  // 팝업창 닫기 핸들러
  const handleClose = () => {
    setOpen(false);
    setError(null);
    setIsSaved(false);
  };

  // 모델명 입력 필드 변경 핸들러
  const handleModelNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    // 숫자만 입력 가능하도록 제한
    if (/^\d*$/.test(value) && value.length <= 8) {
      setModelName(value);
    }
  };

  // 제품명 입력 필드 변경 핸들러
  const handleProductNameChange = (index: number, event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = event.target.value.toUpperCase(); // 자동으로 대문자 변환
    const newProductNames = [...productNames];
    newProductNames[index] = value;
    setProductNames(newProductNames);
  };

  // 입력값 검증
  const validateInput = (): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    // 모델명 검증
    if (modelName.length !== 8) {
      errors.push('모델명은 8자리 숫자여야 합니다');
    } else if (!/^\d{8}$/.test(modelName)) {
      errors.push('모델명은 숫자만 입력 가능합니다');
    }
    
    // 제품명 검증
    productNames.forEach((name, index) => {
      if (name.length !== 6) {
        errors.push(`제품명 ${index + 1}은 6자리여야 합니다`);
      } else if (!/^[A-Z]{2}\d{4}$/.test(name)) {
        errors.push(`제품명 ${index + 1}은 2자리 대문자 + 4자리 숫자 형식이어야 합니다`);
      }
    });
    
    return { isValid: errors.length === 0, errors };
  };

  // 저장 핸들러
  const handleSubmit = async () => {
    // console.log("=== SAVE button clicked - saving product input ===");
    // console.log("Current model name:", modelName);
    // console.log("Current product names:", productNames);
    // console.log("WebSocket connection status:", wsConnection ? wsConnection.readyState : 'No connection');
    
    // 입력값 검증
    const validation = validateInput();
    if (!validation.isValid) {
      setError(validation.errors.join(', '));
      return;
    }
    
    setError(null);
    setIsLoading(true);
    // console.log('✅ Validation passed, saving product input...');
    
    const productData: ProductInputData = {
      modelName,
      productNames
    };
    
    try {
      // 1. localStorage에 저장
      if (typeof window !== 'undefined') {
        localStorage.setItem('productInput', JSON.stringify(productData));
        // console.log("✅ Product input saved to localStorage:", productData);
      }
      
      // 2. WebSocket을 통해 서버에 저장
      if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        const message = `[SAVE_PRODUCT_INPUT] ${JSON.stringify(productData)}`;
        // console.log("📤 Sending product input to server:", message);
        wsConnection.send(message);
      }
      
      // 3. 콜백 함수 호출
      onSave?.(productData);
      
      // 4. 성공 상태 설정
      setIsSaved(true);
      // console.log("✅ Product input saved successfully");
      
      // 5. 2초 후 팝업 닫기
      setTimeout(() => {
        handleClose();
      }, 2000);
      
    } catch (error) {
      console.error('❌ Failed to save product input:', error);
      setError('저장 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box sx={{ p: 1, textAlign: 'center', mt: 1, display: 'flex', justifyContent: 'center' }}>
      <Button 
        variant="outlined" 
        onClick={handleClickOpen} 
        size="large"
        sx={{ width: '120px' }}
      >
        번호입력
      </Button>

      <Dialog
        open={open}
        onClose={handleClose}
        aria-labelledby="product-input-dialog-title"
        fullWidth
        maxWidth="md"
        PaperProps={{ sx: { maxHeight: 800 } }}
      >
        <DialogTitle id="product-input-dialog-title">
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">번호입력</Typography>
            <IconButton
              aria-label="close"
              onClick={handleClose}
              sx={{
                color: (theme) => theme.palette.grey[500],
              }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        
        <DialogContent dividers>
          {/* 모델명 입력 필드 */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'medium' }}>
              모델명 (8자리 숫자)
            </Typography>
            <TextField
              label="모델명"
              variant="outlined"
              size="small"
              value={modelName}
              onChange={handleModelNameChange}
              inputProps={{
                maxLength: 8,
                pattern: '[0-9]*'
              }}
              helperText="8자리 숫자를 입력하세요"
              fullWidth
            />
          </Box>

          {/* 제품명 입력 필드 목록 */}
          <Box>
            <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'medium' }}>
              제품명 (2자리 대문자 + 4자리 숫자)
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 2 }}>
              {productNames.map((name, index) => (
                <Box key={index}>
                  <TextField
                    label={`제품명 ${index + 1}`}
                    variant="outlined"
                    size="small"
                    value={name}
                    onChange={(event) => handleProductNameChange(index, event)}
                    inputProps={{
                      maxLength: 6,
                      style: { textTransform: 'uppercase' }
                    }}
                    helperText="예: PL1234"
                    fullWidth
                  />
                </Box>
              ))}
            </Box>
          </Box>

          {/* 상태 메시지 */}
          <Box sx={{ mt: 2 }}>
            {isLoading && (
              <Alert severity="info" sx={{ fontSize: '0.8rem' }}>
                저장 중...
              </Alert>
            )}
            {isSaved && (
              <Alert severity="success" sx={{ fontSize: '0.8rem' }}>
                저장됨 ✓
              </Alert>
            )}
            {error && (
              <Alert severity="error" sx={{ fontSize: '0.8rem' }}>
                {error}
              </Alert>
            )}
          </Box>
        </DialogContent>
        
        <DialogActions>
          <Button onClick={handleClose} color="error">
            닫기
          </Button>
          <Button 
            onClick={handleSubmit} 
            color="primary" 
            variant="outlined"
            disabled={isLoading}
          >
            입력 완료
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
