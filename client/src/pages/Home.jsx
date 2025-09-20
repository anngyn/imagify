import React from 'react'
import Header from '../componants/Header'
import Steps from '../componants/Steps'
import Description from '../componants/Description'
import Testimonials from '../componants/Testimonials'
import GenerateBtn from '../componants/GenerateBtn'
import Footer from '../componants/Footer'

const Home = () => {
  return (
    <div>
      <Header />
      <Steps />
      <Description />
      <Testimonials />

      <GenerateBtn />
    </div>
  )
}

export default Home