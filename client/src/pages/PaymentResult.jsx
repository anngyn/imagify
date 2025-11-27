import React, { useContext, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { AppContext } from '../context/AppContext'
import { toast } from 'react-toastify'

const PaymentResult = () => {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const { loadCreditsData } = useContext(AppContext)

    useEffect(() => {
        const status = searchParams.get('status')
        
        if (status === '00') {
            toast.success('Payment successful! Credits added to your account.')
            loadCreditsData() // Reload credits
        } else {
            toast.error('Payment failed. Please try again.')
        }

        // Redirect to buy credits page after 3 seconds
        setTimeout(() => {
            navigate('/buy')
        }, 3000)
    }, [searchParams, navigate, loadCreditsData])

    const status = searchParams.get('status')

    return (
        <div className='min-h-[80vh] flex items-center justify-center'>
            <div className='text-center'>
                {status === '00' ? (
                    <>
                        <div className='text-6xl mb-4'>✅</div>
                        <h1 className='text-3xl font-bold text-green-600 mb-2'>Payment Successful!</h1>
                        <p className='text-gray-600'>Credits have been added to your account.</p>
                    </>
                ) : (
                    <>
                        <div className='text-6xl mb-4'>❌</div>
                        <h1 className='text-3xl font-bold text-red-600 mb-2'>Payment Failed</h1>
                        <p className='text-gray-600'>Please try again or contact support.</p>
                    </>
                )}
                <p className='text-sm text-gray-500 mt-4'>Redirecting in 3 seconds...</p>
            </div>
        </div>
    )
}

export default PaymentResult
