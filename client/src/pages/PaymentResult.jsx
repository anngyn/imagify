import React, { useEffect, useState, useContext } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext';
import { toast } from 'react-toastify';
import axios from 'axios';

const PaymentResult = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { backendUrl, loadCreditsData } = useContext(AppContext);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);

  useEffect(() => {
    const verifyPayment = async () => {
      try {
        const params = Object.fromEntries(searchParams.entries());
        
        const { data } = await axios.get(backendUrl + '/api/user/vnpay-return', {
          params: params
        });

        setResult(data);
        
        if (data.success) {
          toast.success('Thanh toán thành công!');
          await loadCreditsData(); // Cập nhật lại credits
        } else {
          toast.error('Thanh toán thất bại: ' + data.message);
        }
      } catch (error) {
        console.log(error);
        toast.error('Có lỗi xảy ra khi xác thực thanh toán');
        setResult({ success: false, message: 'Có lỗi xảy ra' });
      } finally {
        setLoading(false);
      }
    };

    verifyPayment();
  }, [searchParams, backendUrl, loadCreditsData]);

  const handleContinue = () => {
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Đang xác thực thanh toán...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        {result?.success ? (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Thanh toán thành công!</h2>
            <p className="text-gray-600 mb-4">
              Bạn đã nhận được {result.credits} credits
            </p>
            <button
              onClick={handleContinue}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
            >
              Tiếp tục sử dụng
            </button>
          </>
        ) : (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Thanh toán thất bại</h2>
            <p className="text-gray-600 mb-4">
              {result?.message || 'Có lỗi xảy ra trong quá trình thanh toán'}
            </p>
            <div className="space-y-2">
              <button
                onClick={() => navigate('/buy')}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
              >
                Thử lại
              </button>
              <button
                onClick={handleContinue}
                className="w-full bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400 transition-colors"
              >
                Về trang chủ
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PaymentResult;