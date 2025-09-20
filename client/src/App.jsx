import React, { useContext } from 'react'
import { Routes, Route } from 'react-router-dom'

import {ToastContainer} from 'react-toastify'


import Home from './pages/Home'
import Result from './pages/Result'
import BuyCredits from './pages/BuyCredits'
import PaymentResult from './pages/PaymentResult'
import Navbar from './componants/Navbar'
import Footer from './componants/Footer'
import Login from './componants/Login'
import AppContextProvider, { AppContext } from './context/AppContext'

const App = () => {

  const {showLogin} = useContext(AppContext)
  return (
    <div className='px-4 sm:px-10 md:px-14 lg:px-28 min-h-screen bg-gradient-to-b from-teal-50 to orange-50'>
      <ToastContainer position='bottom-righht'/>
      <Navbar />
      {showLogin && <Login/>}
      <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/result' element={<Result />} />
        <Route path='/buy' element={<BuyCredits />} />
        <Route path='/payment-result' element={<PaymentResult />} />
      </Routes>
      <Footer />

    </div>
  )
}

export default App