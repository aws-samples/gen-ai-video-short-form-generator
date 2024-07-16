import { Authenticator } from '@aws-amplify/ui-react';
import { Amplify } from 'aws-amplify';
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import outputs from '../amplify_outputs.json';
import '@aws-amplify/ui-react/styles.css';

import MainComponent from './pages/MainComponent';
import VideoUploadComponent from './pages/VideoUploadComponent';
import VideoShortifyComponent from './pages/VideoShortifyComponent';
import ShortsHistoryComponent from './pages/ShortsHistroyComponent';
import FinalShortComponent from './pages/FinalShortComponent';


Amplify.configure(outputs);

function App() {

  return (
    <Authenticator>
      {({signOut, user}) => (
        <BrowserRouter>
          <Routes>
            <Route element={<MainComponent signOut={signOut} user={user}/>}>
              <Route path="/" element={<VideoUploadComponent />}></Route>
              <Route path="/history" element={<ShortsHistoryComponent />}></Route>
              <Route path="/history/:id" element={<VideoShortifyComponent />}></Route>
              <Route path="/shorts/:id/:highlight" element={<FinalShortComponent />}></Route>
            </Route>
          </Routes>
        </BrowserRouter>
      )}
    </Authenticator>
  )
}

export default App
