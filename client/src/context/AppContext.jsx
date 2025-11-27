import { createContext, useEffect, useState } from "react";
import { toast } from "react-toastify";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { signIn, signUp, signOut, getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';

export const AppContext = createContext();

const AppContextProvider = (props) => {
  const [user, setUser] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [token, setToken] = useState(() => {
    return localStorage.getItem('token') || null;
  });
  const [credit, setCredit] = useState(0);
  
  const apiUrl = import.meta.env.VITE_API_URL;
  const navigate = useNavigate();

  // AWS Cognito Login
  const login = async (email, password) => {
    try {
      const result = await signIn({ username: email, password });
      
      if (result.isSignedIn) {
        const session = await fetchAuthSession();
        const idToken = session.tokens.idToken.toString();
        const currentUser = await getCurrentUser();
        
        // Set states immediately
        const userData = {
          email: currentUser.username,
          name: currentUser.attributes?.name || 'User',
          userId: currentUser.userId || currentUser.username
        };
        
        setToken(idToken);
        localStorage.setItem('token', idToken);
        setUser(userData);
        setShowLogin(false);
        
        // Get credits from backend
        try {
          // Temporarily disable to avoid CORS issue
          // const { data } = await axios.get(`${apiUrl}/user/credits`, {
          //   headers: { 'Authorization': accessToken }  // No Bearer prefix for Cognito Authorizer
          // });
          // setCredit(data.credits || 10);
          setCredit(10); // Default credits for now
        } catch (e) {
          setCredit(10);
        }
        
        toast.success("Login successful!");
        navigate('/');
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  // Register via backend API
  const register = async (name, email, password) => {
    try {
      // Call backend to create user record (backend handles Cognito creation)
      await axios.post(`${apiUrl}/auth/register`, {
        name, email, password
      });
      
      toast.success("Registration successful! Please login.");
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || 'Registration failed';
      toast.error(errorMessage);
    }
  };

  // Logout
  const logout = async () => {
    try {
      await signOut();
      setToken(null);
      localStorage.removeItem('token');
      setUser(null);
      setCredit(0);
      navigate('/');
    } catch (error) {
      toast.error(error.message);
    }
  };

  // Load user credits
  const loadCreditsData = async (authToken = token) => {
    try {
      // Temporarily disable to avoid CORS issue
      // const { data } = await axios.get(`${apiUrl}/user/credits`, {
      //   headers: { 
      //     'Authorization': authToken,  // No Bearer prefix for Cognito Authorizer
      //     'Content-Type': 'application/json'
      //   }
      // });
      // setCredit(data.credits || 10);
      setCredit(10); // Default credits for now
    } catch (error) {
      console.log(error);
      setCredit(10); // Default credits
    }
  };

  // Generate Image
  const generateImage = async (prompt) => {
    try {
      console.log('Generating image with prompt:', prompt);
      console.log('API URL:', `${apiUrl}/image/generate`);
      console.log('Token:', token ? 'Present' : 'Missing');
      
      const { data } = await axios.post(`${apiUrl}/image/generate`, {
        prompt
      }, {
        headers: { 
          'Authorization': token,  // No Bearer prefix for Cognito Authorizer
          'Content-Type': 'application/json'
        },
        timeout: 60000  // 60 second timeout
      });

      console.log('API Response:', data);
      
      if (data.imageUrl) {
        setCredit(data.remainingCredits);
        return data.imageUrl;
      }
    } catch (error) {
      console.error('Generate image error:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);
      
      const errorMessage = error.response?.data?.error || error.message || 'Network error occurred';
      toast.error(errorMessage);
      throw error;
    }
  };

  // Payment
  const payCredits = async (packageType) => {
    try {
      const { data } = await axios.post(`${apiUrl}/payment/vnpay`, {
        userId: user.userId,
        packageType
      }, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  // Check auth on load
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const currentUser = await getCurrentUser();
        if (currentUser) {
          const session = await fetchAuthSession();
          const idToken = session.tokens.idToken.toString();
          
          const userData = {
            email: currentUser.username,
            name: currentUser.attributes?.name || 'User',
            userId: currentUser.userId || currentUser.username
          };
          
          setToken(idToken);
          setUser(userData);
          
          await loadCreditsData(idToken);
        }
      } catch (error) {
        console.log('No authenticated user');
        setUser(null);
        setToken(null);
        setCredit(0);
      }
    };

    checkAuth();
  }, []);

  const value = {
    user, setUser,
    showLogin, setShowLogin,
    token, setToken,
    credit, setCredit,
    loadCreditsData,
    login,
    register,
    logout,
    generateImage,
    payCredits
  };

  return (
    <AppContext.Provider value={value}>
      {props.children}
    </AppContext.Provider>
  );
};

export default AppContextProvider;
