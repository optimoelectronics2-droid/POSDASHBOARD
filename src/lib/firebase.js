import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore, memoryLocalCache } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

export const firebaseConfig = {
  apiKey: 'AIzaSyDlOJqBgd-8KqUT-Y94lsma5W8T79PsPjM',
  authDomain: 'trifusion-cotizador.firebaseapp.com',
  projectId: 'trifusion-cotizador',
  storageBucket: 'trifusion-cotizador.firebasestorage.app',
  messagingSenderId: '407374211882',
  appId: '1:407374211882:web:b692792ccc39c8d48f4c53',
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
})
export const storage = getStorage(app)
