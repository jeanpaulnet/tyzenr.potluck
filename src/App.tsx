import React from 'react';
import { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useParams, Link } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User,
  OperationType,
  handleFirestoreError
} from './firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  Timestamp,
  deleteDoc,
  where,
  addDoc,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { 
  Plus, 
  Trash2, 
  Share2, 
  LogIn, 
  LogOut, 
  ChevronRight, 
  Users, 
  Utensils, 
  Save,
  ArrowLeft,
  Copy,
  Check,
  Image as ImageIcon,
  X,
  Search,
  ExternalLink,
  Download,
  Upload,
  Globe,
  Lock,
  Unlock
} from 'lucide-react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'motion/react';
import { APP_VERSION, BUILD_DATE } from './version';

// --- Types ---

// --- Error Boundary ---

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  constructor(props: ErrorBoundaryProps) {
    super(props);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let message = "Something went wrong.";
      try {
        const errData = JSON.parse(this.state.error?.message || '{}');
        if (errData.error) {
          if (errData.error.includes('Missing or insufficient permissions')) {
            message = "You don't have permission to perform this action. Please make sure you are signed in as the owner.";
          } else if (errData.error.includes('quota') || errData.error.includes('resource-exhausted')) {
            message = "Your daily database limit has been reached. Changes cannot be saved until tomorrow.";
          }
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-6">
          <div className="max-w-md w-full bg-white p-8 rounded-3xl border border-black/5 shadow-xl text-center">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trash2 size={32} />
            </div>
            <h2 className="text-2xl font-bold text-zinc-900 mb-2">Oops!</h2>
            <p className="text-zinc-600 mb-8">{message}</p>
            <button 
              onClick={() => window.location.href = '/'}
              className="w-full py-3 bg-zinc-900 text-white rounded-xl font-semibold hover:bg-zinc-800 transition-all"
            >
              Go to Home
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

// --- Types ---

interface Guest {
  id: string;
  name: string;
  locked?: boolean;
}

interface Dish {
  id: string;
  name: string;
  description?: string;
  count: number;
  ownerIds: string[];
  color?: string;
  imageUrl?: string;
  locked?: boolean;
}

interface Potluck {
  id: string;
  title: string;
  description?: string;
  totalPeople?: number;
  ownerId: string;
  createdAt: Timestamp;
  guests: Guest[];
  dishes: Dish[];
  version?: number;
}

// --- Image Search Modal ---

interface ImageSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  dishName: string;
  currentUrl: string;
  onSelect: (url: string) => void;
}

const ImageSearchModal = ({ isOpen, onClose, dishName, currentUrl, onSelect }: ImageSearchModalProps) => {
  const [manualUrl, setManualUrl] = useState("");

  useEffect(() => {
    if (isOpen) {
      setManualUrl(currentUrl || "");
    }
  }, [isOpen, currentUrl]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualUrl) {
      onSelect(manualUrl);
      setManualUrl("");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="px-6 py-5 border-b border-black/5 flex items-center justify-between bg-zinc-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
              <ImageIcon size={20} />
            </div>
            <div>
              <h3 className="font-bold text-zinc-900">Set Dish Image</h3>
              <p className="text-xs text-zinc-500">Enter URL for {dishName || "this dish"}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-200 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Manual URL Input */}
          <form onSubmit={handleManualSubmit} className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Image URL</label>
              <a 
                href={`https://www.google.com/search?q=${encodeURIComponent(dishName + ' food')}&tbm=isch`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 transition-colors"
              >
                <Search size={10} />
                Search on Google
              </a>
            </div>
            <div className="flex flex-col gap-3">
              <input 
                type="url" 
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="w-full px-4 py-3 bg-zinc-50 border border-black/5 rounded-xl focus:bg-white focus:border-emerald-500 focus:outline-none transition-all"
                autoFocus
                maxLength={200}
              />
              <button 
                type="submit"
                className="w-full py-3 bg-zinc-900 text-white rounded-xl font-semibold hover:bg-zinc-800 transition-all"
              >
                Set Image URL
              </button>
            </div>
          </form>
        </div>

        <div className="px-6 py-4 bg-zinc-50 border-t border-black/5 flex items-center justify-end">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-zinc-600 hover:text-zinc-900 transition-colors"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// --- Helpers ---

const saveToExternalApi = async (user: User | null, potluckId: string, potluckData: Potluck) => {
  const payload = {
    userId: user ? user.uid : "",
    Id: potluckId,
    Content: JSON.stringify(potluckData)
  };
  
  console.log(`[API REQ] POST /api/common`, payload);
  
  try {
    const response = await fetch('/api/common', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    console.log(`[API RES] POST /api/common - Status: ${response.status}`);
  } catch (err) {
    console.error("[API ERR] POST /api/common:", err);
  }
};

// --- Components ---

const Navbar = ({ user }: { user: User | null }) => {
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoginError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Login failed", error);
      if (error.code === 'auth/popup-blocked') {
        setLoginError("The login popup was blocked by your browser. Please allow popups for this site.");
      } else if (error.code === 'auth/network-request-failed') {
        setLoginError("Network error. If you are in incognito mode, please ensure third-party cookies are enabled or try a normal window.");
      } else if (error.code === 'auth/cancelled-by-user') {
        // Just ignore if user closed the popup
      } else {
        setLoginError(`Login failed: ${error.message || "Please try again."}`);
      }
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  return (
    <nav className="flex flex-col bg-zinc-100 border-b border-black/5 sticky top-0 z-50">
      <div className="flex items-center justify-between px-6 py-4">
        <Link to="/" className="text-xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white">
            <Utensils size={18} />
          </div>
          Potluck Place 
          <div className="flex flex-col ml-1">
            <span className="text-[10px] font-normal text-zinc-400 leading-none">v{APP_VERSION}</span>
            <span className="text-[8px] font-normal text-zinc-300 leading-none">{BUILD_DATE}</span>
          </div>
        </Link>
        <div className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end mr-1">
                <span className="text-xs font-semibold text-zinc-900">{user.displayName}</span>
                <span className="text-[10px] text-zinc-400 font-mono select-all" title="User ID (UID)">{user.uid}</span>
              </div>
              <img src={user.photoURL || ''} alt={user.displayName || ''} className="w-8 h-8 rounded-full border border-black/5" referrerPolicy="no-referrer" />
              <button 
                onClick={handleLogout}
                className="flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
              >
                <LogOut size={16} />
                Sign Out
              </button>
            </div>
          ) : (
            <button 
              onClick={handleLogin}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-xl text-sm font-medium hover:bg-zinc-800 transition-all shadow-sm"
            >
              <LogIn size={16} />
              Sign In with Google
            </button>
          )}
        </div>
      </div>
      
      {loginError && (
        <div className="bg-red-50 border-t border-red-100 px-6 py-2 flex items-center justify-between animate-in slide-in-from-top duration-300">
          <p className="text-xs text-red-600 font-medium">{loginError}</p>
          <button onClick={() => setLoginError(null)} className="text-red-400 hover:text-red-600">
            <X size={14} />
          </button>
        </div>
      )}
    </nav>
  );
};

const HomePage = ({ user }: { user: User | null }) => {
  const [potlucks, setPotlucks] = useState<Potluck[]>([]);
  const [loading, setLoading] = useState(true);
  const [isBackupLoading, setIsBackupLoading] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      setPotlucks([]);
      setLoading(false);
      return;
    }

    const fetchExternal = async () => {
      try {
        setIsBackupLoading(true);
        const url = `/api/common/list/${user.uid}`;
        console.log(`[API REQ] GET ${url}`);
        
        const response = await fetch(url);
        console.log(`[API RES] GET ${url} - Status: ${response.status}`);
        
        if (response.ok) {
          const externalData = await response.json();
          console.log(`[API RES DATA]`, externalData);
          if (Array.isArray(externalData)) {
            const parsedList = externalData.map((item: any) => {
              try {
                const content = JSON.parse(item.Content);
                return {
                  ...content,
                  id: item.Id || content.id,
                  // Ensure createdAt is a Timestamp if it's just an object from JSON
                  createdAt: content.createdAt?.seconds 
                    ? new Timestamp(content.createdAt.seconds, content.createdAt.nanoseconds)
                    : Timestamp.now()
                } as Potluck;
              } catch (e) {
                console.error("Error parsing external potluck content", e);
                return null;
              }
            }).filter(p => p !== null) as Potluck[];
            
            if (parsedList.length > 0) {
              setPotlucks(prev => {
                // Merge external with existing (Firestore usually wins if it's already loaded)
                const existingIds = new Set(prev.map(p => p.id));
                const newItems = parsedList.filter(p => !existingIds.has(p.id));
                return [...prev, ...newItems].sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
              });
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch external potlucks:", err);
      } finally {
        setIsBackupLoading(false);
      }
    };

    fetchExternal();

    const q = query(
      collection(db, 'potlucks'), 
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => {
        const data = doc.data();
        return { 
          title: "Untitled Potluck",
          description: "",
          totalPeople: 0,
          guests: [],
          dishes: [],
          ...data, 
          id: doc.id 
        } as Potluck;
      });
      setPotlucks(list);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching potlucks", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  const createNewPotluck = async () => {
    if (!user) return;
    
    setIsCreating(true);
    const id = uuidv4();
    const newPotluck: Potluck = {
      id,
      title: "New Potluck",
      description: "",
      totalPeople: 10,
      ownerId: user.uid,
      createdAt: Timestamp.now(),
      guests: [],
      dishes: [],
      version: 1
    };

    try {
      // Don't await external API to avoid blocking navigation
      saveToExternalApi(user, id, newPotluck);
      
      await setDoc(doc(db, 'potlucks', id), newPotluck);
      navigate(`/potluck/${id}`);
    } catch (error: any) {
      console.error("Create error:", error);
      setIsCreating(false);
      if (error.message?.includes('quota') || error.message?.includes('resource-exhausted')) {
        setHomeError("Your daily database limit has been reached. Cannot create new potluck.");
      } else {
        handleFirestoreError(error, OperationType.CREATE, `potlucks/${id}`);
      }
    }
  };

  const deletePotluck = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'potlucks', id));
      setDeleteConfirmId(null);
      setHomeError(null);
    } catch (error: any) {
      console.error("Delete error:", error);
      if (error.message?.includes('quota') || error.message?.includes('resource-exhausted')) {
        setHomeError("Your daily database limit has been reached. Cannot delete potluck.");
      } else {
        handleFirestoreError(error, OperationType.DELETE, `potlucks/${id}`);
      }
    }
  };

  const clearAllImages = async () => {
    if (!user || potlucks.length === 0) return;
    if (!window.confirm(`Are you sure you want to remove images from ALL ${potlucks.length} of your potlucks? This cannot be undone.`)) return;

    setLoading(true);
    setHomeError(null);
    try {
      const batch = writeBatch(db);
      for (const p of potlucks) {
        const updatedDishes = p.dishes.map(d => ({ ...d, imageUrl: "" }));
        const docRef = doc(db, 'potlucks', p.id);
        batch.update(docRef, { dishes: updatedDishes });
      }
      await batch.commit();
      setHomeError("All dish images have been removed from your potlucks.");
    } catch (error: any) {
      console.error("Error clearing images:", error);
      if (error.message?.includes('quota') || error.message?.includes('resource-exhausted')) {
        setHomeError("Your daily database limit has been reached. Cannot clear images.");
      } else {
        setHomeError("Failed to clear images. Check console for details.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);
        
        if (!data.title) throw new Error("Invalid potluck data: missing title");

        const id = uuidv4();
        const importedPotluck: Potluck = {
          ...data,
          id,
          title: `(Import) ${data.title}`,
          ownerId: user.uid,
          createdAt: Timestamp.now(),
          guests: Array.isArray(data.guests) ? data.guests : [],
          dishes: Array.isArray(data.dishes) ? data.dishes : []
        };

        await setDoc(doc(db, 'potlucks', id), importedPotluck);
        navigate(`/potluck/${id}`);
      } catch (err) {
        console.error("Import error:", err);
        setHomeError("Failed to import potluck. Please make sure the file is a valid JSON export.");
      }
    };
    reader.readAsText(file);
    // Reset input
    event.target.value = '';
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      {homeError && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <X size={18} />
            <span className="text-sm font-medium">{homeError}</span>
          </div>
          <button onClick={() => setHomeError(null)} className="p-1 hover:bg-red-100 rounded-lg">
            <X size={14} />
          </button>
        </motion.div>
      )}
      <div className="flex items-center justify-between mb-12">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 mb-2">
            Your Potlucks
          </h1>
          <p className="text-zinc-500">Coordinate meals and guests with ease.</p>
          {isBackupLoading && (
            <p className="text-[10px] text-emerald-500 font-medium animate-pulse mt-1">Syncing with backup API...</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {user && (
            <label className="flex items-center gap-2 px-4 py-3 bg-white text-zinc-600 rounded-2xl font-semibold hover:bg-zinc-50 transition-all border border-black/5 cursor-pointer shadow-sm">
              <Upload size={18} />
              Import
              <input 
                type="file" 
                accept=".json" 
                onChange={handleImport} 
                className="hidden" 
              />
            </label>
          )}
          {user && potlucks.length > 0 && (
            <button 
              onClick={createNewPotluck}
              disabled={isCreating}
              className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-2xl font-semibold hover:bg-emerald-600 transition-all shadow-md hover:shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Plus size={20} />
              )}
              {isCreating ? 'Creating...' : 'Create New'}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
        </div>
      ) : potlucks.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {potlucks.map((p) => (
            <motion.div 
              key={p.id}
              layoutId={p.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="group bg-zinc-100 border border-black/5 rounded-3xl p-6 hover:shadow-xl hover:shadow-emerald-500/5 transition-all cursor-pointer relative overflow-hidden"
              onClick={() => navigate(`/potluck/${p.id}`)}
            >
              {user?.uid === p.ownerId && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirmId(p.id);
                  }}
                  className="absolute top-2 right-2 w-5 h-5 bg-red-400 text-white rounded-full flex items-center justify-center shadow-sm opacity-30 group-hover:opacity-100 transition-all hover:bg-red-500 z-10"
                  title="Delete potluck"
                >
                  <X size={14} strokeWidth={3} />
                </button>
              )}
              <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronRight className="text-zinc-400" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900 mb-4 group-hover:text-emerald-600 transition-colors">{p.title}</h3>
              <div className="flex items-center gap-6 text-sm text-zinc-500">
                <div className="flex items-center gap-1.5">
                  <Users size={16} />
                  {p.guests.length} Guests
                </div>
                <div className="flex items-center gap-1.5">
                  <Utensils size={16} />
                  {p.dishes.length} Dishes
                </div>
              </div>
              <div className="mt-6 pt-6 border-t border-black/5 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-xs text-zinc-400">
                    {p.createdAt.toDate().toLocaleDateString()}
                  </span>
                  {p.version && (
                    <span className="text-[10px] text-zinc-300 font-mono">v{p.version}</span>
                  )}
                </div>
                {user?.uid === p.ownerId && (
                  <span className="text-xs font-medium px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg">Owner</span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="text-center py-24 bg-zinc-50 rounded-3xl border-2 border-dashed border-zinc-200">
          <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4 text-zinc-400">
            <Utensils size={32} />
          </div>
          {user ? (
            <>
              <h3 className="text-lg font-medium text-zinc-900 mb-1">No potlucks yet</h3>
              <p className="text-zinc-500 mb-6">Create your first potluck to get started!</p>
              <button 
                onClick={createNewPotluck}
                disabled={isCreating}
                className="inline-flex items-center gap-2 px-6 py-2 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Plus size={18} />
                )}
                {isCreating ? 'Creating...' : 'Create Potluck'}
              </button>
            </>
          ) : (
            <>
              <h3 className="text-lg font-medium text-zinc-900 mb-1">Sign in to see your potlucks</h3>
              <p className="text-zinc-500 mb-6">You need to be signed in to manage your potlucks.</p>
            </>
          )}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AnimatePresence>
        {deleteConfirmId && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6"
            onClick={() => setDeleteConfirmId(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-zinc-900 text-center mb-2">Delete Potluck?</h3>
              <p className="text-zinc-500 text-center mb-8">
                This will permanently remove this potluck and all its data. This action cannot be undone.
              </p>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => deletePotluck(deleteConfirmId)}
                  className="w-full py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200"
                >
                  Yes, Delete Potluck
                </button>
                <button 
                  onClick={() => setDeleteConfirmId(null)}
                  className="w-full py-4 bg-zinc-100 text-zinc-600 rounded-2xl font-bold hover:bg-zinc-200 transition-all"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface DishItemProps {
  dish: Dish;
  canEdit: boolean;
  isOwner: boolean;
  potluck: Potluck;
  updateDish: (id: string, updates: Partial<Dish>) => void;
  toggleOwner: (dishId: string, guestId: string) => void;
  openImageSearch: (dish: Dish) => void;
  setDeleteConfirmId: (id: string | null) => void;
  handleSave: (updatedPotluck?: any, action?: string) => Promise<void>;
  toggleDishLock: (id: string) => void;
}

const DishItem: React.FC<DishItemProps> = ({ 
  dish, 
  canEdit, 
  isOwner,
  potluck, 
  updateDish, 
  toggleOwner, 
  openImageSearch, 
  setDeleteConfirmId, 
  handleSave,
  toggleDishLock
}) => {
  const controls = useDragControls();
  const canEditThisDish = isOwner || (canEdit && !dish.locked);

  return (
    <Reorder.Item 
      value={dish}
      dragControls={controls}
      dragListener={false}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`border rounded-2xl p-6 pl-10 relative group transition-all ${dish.locked ? 'border-zinc-300 shadow-inner bg-zinc-200' : 'bg-[#f5f5f5] border-black/10'}`}
    >
      {canEdit && (
        <div 
          onPointerDown={(e) => controls.start(e)}
          className="absolute top-1/2 -translate-y-1/2 left-3 p-2 text-zinc-400 cursor-grab active:cursor-grabbing hover:text-zinc-600 transition-colors z-20"
        >
          <div className="grid grid-cols-2 gap-1">
            <div className="w-1.5 h-1.5 bg-current rounded-full opacity-60" />
            <div className="w-1.5 h-1.5 bg-current rounded-full opacity-60" />
            <div className="w-1.5 h-1.5 bg-current rounded-full opacity-60" />
            <div className="w-1.5 h-1.5 bg-current rounded-full opacity-60" />
          </div>
        </div>
      )}
      {isOwner && (
        <div className="absolute top-2 right-2 z-10">
          <button 
            onClick={() => setDeleteConfirmId(dish.id)}
            className="p-1 bg-red-400 text-white rounded-full flex items-center justify-center shadow-sm opacity-30 group-hover:opacity-100 transition-all hover:bg-red-500"
            title="Delete dish"
          >
            <X size={12} strokeWidth={3} />
          </button>
        </div>
      )}
      
      {!isOwner && dish.locked && (
        <div className="absolute bottom-2 right-2 text-amber-500 z-30" title="This dish is locked by the creator">
          <Lock size={12} />
        </div>
      )}
      
      {isOwner && (
        <button 
          onClick={() => toggleDishLock(dish.id)}
          className={`absolute bottom-2 right-2 p-1 rounded-md transition-all shadow-sm z-30 ${dish.locked ? 'bg-amber-500 text-white' : 'bg-white text-zinc-400 hover:text-amber-500 border border-black/5'}`}
          title={dish.locked ? "Unlock dish" : "Lock dish"}
        >
          {dish.locked ? <Lock size={10} /> : <Unlock size={10} />}
        </button>
      )}
      
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div 
            className="w-[48px] h-[48px] rounded-xl flex-shrink-0 shadow-sm border border-black/5 overflow-hidden cursor-pointer group/img relative"
            style={{ backgroundColor: !dish.imageUrl ? (dish.color || '#E5E7EB') : 'transparent' }}
            onClick={() => canEditThisDish && openImageSearch(dish)}
            title={canEditThisDish ? "Click to set image" : ""}
          >
            {dish.imageUrl ? (
              <img 
                src={dish.imageUrl} 
                alt={dish.name} 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/50">
                <ImageIcon size={20} />
              </div>
            )}
            
            {canEditThisDish && (
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                <Plus size={16} className="text-white" />
              </div>
            )}
          </div>
          <div className="flex-1 flex flex-row gap-4 w-full min-w-0">
          <div className="flex-1 min-w-0">
            {canEditThisDish ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
                <input 
                  type="text" 
                  value={dish.name}
                  placeholder="Dish Name"
                  onChange={(e) => updateDish(dish.id, { name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSave();
                      e.currentTarget.blur();
                    }
                  }}
                  onBlur={() => handleSave()}
                  className="w-full sm:flex-1 min-w-0 px-3 py-1.5 bg-zinc-50 border border-transparent rounded-xl focus:border-green-500 focus:outline-none transition-all font-semibold text-zinc-900 text-sm"
                />
                <input 
                  type="text" 
                  value={dish.description || ""}
                  placeholder="Description"
                  onChange={(e) => updateDish(dish.id, { description: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSave();
                      e.currentTarget.blur();
                    }
                  }}
                  onBlur={() => handleSave()}
                  className="w-full sm:flex-1 min-w-0 px-3 py-1.5 bg-yellow-50 border border-transparent rounded-xl focus:border-green-500 focus:outline-none transition-all text-zinc-900 text-xs"
                />
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 w-full min-w-0">
                <div className="font-semibold text-zinc-900 text-sm truncate sm:flex-1 min-w-0">{dish.name || "Unnamed Dish"}</div>
                {dish.description && (
                  <div className="px-3 py-1 bg-yellow-50 rounded-lg text-zinc-900 text-xs leading-tight sm:flex-1 min-w-0 break-words">{dish.description}</div>
                )}
              </div>
            )}
          </div>
          <div className="w-10 md:w-12 relative group/tooltip">
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-900 text-white text-[10px] rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 shadow-xl">
              Total quantity or count
            </div>
            <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-wider block mb-1 leading-tight">Serves</span>
            {canEditThisDish ? (
              <input 
                type="number" 
                value={dish.count}
                onChange={(e) => updateDish(dish.id, { count: parseInt(e.target.value) || 0 })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSave();
                    e.currentTarget.blur();
                  }
                }}
                onBlur={() => handleSave()}
                title="Total quantity or count"
                className="w-full px-2 py-1.5 bg-zinc-50 border border-transparent rounded-xl focus:border-green-500 focus:outline-none transition-all font-medium text-zinc-900 text-sm text-center"
              />
            ) : (
              <div className="font-medium text-zinc-700 text-sm text-center">{dish.count}</div>
            )}
          </div>
        </div>
      </div>
    </div>

    <div className="flex flex-wrap gap-2 pt-2 border-t border-black/5 relative pr-10">
        {potluck.guests.map((guest) => {
          const canToggle = isOwner || !dish.locked;
          
          return (
            <button
              key={guest.id}
              disabled={!canToggle}
              onClick={() => toggleOwner(dish.id, guest.id)}
              className={`px-2 py-0.5 rounded-full text-xs font-medium transition-all flex items-center gap-1 ${
                dish.ownerIds.includes(guest.id)
                  ? 'bg-green-500 text-white shadow-sm'
                  : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
              } ${!canToggle ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {guest.name || "Guest"}
            </button>
          );
        })}
      </div>
    </Reorder.Item>
  );
};

interface GuestItemProps {
  key?: string;
  guest: Guest;
  potluck: Potluck;
  canEdit: boolean;
  isOwner: boolean;
  updateGuest: (id: string, name: string) => void;
  removeGuest: (id: string) => void;
  setDeleteConfirmId: (id: string | null) => void;
  handleSave: (updatedPotluck?: any, action?: string) => Promise<void>;
  toggleGuestLock: (id: string) => void;
}

const GuestItem = ({ guest, potluck, canEdit, isOwner, updateGuest, removeGuest, setDeleteConfirmId, handleSave, toggleGuestLock }: GuestItemProps) => {
  const controls = useDragControls();
  const canEditThisGuest = canEdit;

  return (
    <Reorder.Item 
      value={guest}
      dragControls={controls}
      dragListener={false}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className={`flex items-center gap-3 group relative pl-10 pr-12 py-2 rounded-2xl transition-all`}
    >
      {!isOwner && guest.locked && (
        <div className="absolute bottom-2 right-2 text-amber-500 z-30" title="This guest is locked by the creator">
          <Lock size={12} />
        </div>
      )}

      {isOwner && (
        <button 
          onClick={() => toggleGuestLock(guest.id)}
          className={`absolute bottom-2 right-2 p-1 rounded-md transition-all shadow-sm z-30 ${guest.locked ? 'bg-amber-500 text-white' : 'bg-white text-zinc-400 hover:text-amber-500 border border-black/5'}`}
          title={guest.locked ? "Unlock guest" : "Lock guest"}
        >
          {guest.locked ? <Lock size={10} /> : <Unlock size={10} />}
        </button>
      )}

      {canEdit && (
        <div 
          onPointerDown={(e) => controls.start(e)}
          className="absolute top-1/2 -translate-y-1/2 left-2 p-2 text-zinc-400 cursor-grab active:cursor-grabbing hover:text-zinc-600 transition-colors z-20"
        >
          <div className="grid grid-cols-2 gap-1">
            <div className="w-1.5 h-1.5 bg-current rounded-full opacity-60" />
            <div className="w-1.5 h-1.5 bg-current rounded-full opacity-60" />
            <div className="w-1.5 h-1.5 bg-current rounded-full opacity-60" />
            <div className="w-1.5 h-1.5 bg-current rounded-full opacity-60" />
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
        <div className="w-10 h-10 rounded-xl flex-shrink-0 border border-black/5 bg-purple-50 flex items-center justify-center text-purple-500">
          <Users size={16} />
        </div>
        <div className="relative min-w-[120px]">
          {canEditThisGuest ? (
            <>
              <span className="invisible whitespace-pre px-4 py-2 block min-h-[42px]">{guest.name || "Guest name"}</span>
              <input 
                type="text" 
                value={guest.name}
                placeholder="Guest name"
                onChange={(e) => updateGuest(guest.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSave();
                    e.currentTarget.blur();
                  }
                }}
                onBlur={() => handleSave()}
                className="absolute inset-0 w-full px-4 py-2 bg-zinc-200 border border-transparent rounded-xl focus:bg-white focus:border-purple-500 focus:outline-none transition-all"
              />
            </>
          ) : (
            <div className="px-4 py-2 font-semibold text-zinc-900 truncate">{guest.name || "Guest"}</div>
          )}
        </div>
      </div>
      <div className="flex-1 flex flex-wrap gap-1 justify-end">
        {potluck.dishes.filter(d => d.ownerIds.includes(guest.id)).map(d => (
          <div 
            key={d.id} 
            title={d.name || "Unnamed Dish"}
            className="px-2 py-0.5 bg-white border border-black/5 rounded-lg text-[10px] font-medium text-zinc-600 shadow-sm"
          >
            {d.name || "Dish"}
          </div>
        ))}
      </div>
      
      <div className="flex items-center gap-1 flex-shrink-0">
        {isOwner && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1">
            <button 
              onClick={() => setDeleteConfirmId(guest.id)}
              className="w-5 h-5 bg-red-400 text-white rounded-full flex items-center justify-center shadow-sm opacity-30 group-hover:opacity-100 transition-all hover:bg-red-500 flex-shrink-0"
              title="Remove guest"
            >
              <X size={12} strokeWidth={3} />
            </button>
          </div>
        )}
      </div>
    </Reorder.Item>
  );
};

const PotluckDetail = ({ user }: { user: User | null }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [potluck, setPotluck] = useState<Potluck | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [urlEditId, setUrlEditId] = useState<string | null>(null);
  const [tempUrl, setTempUrl] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteType, setDeleteType] = useState<'dish' | 'guest' | null>(null);
  const [imageSearchOpen, setImageSearchOpen] = useState(false);
  const [activeDishForSearch, setActiveDishForSearch] = useState<Dish | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const potluckRef = React.useRef(potluck);
  const lastSavedRef = React.useRef<string>("");

  useEffect(() => {
    potluckRef.current = potluck;
    if (potluck && !lastSavedRef.current) {
      const replacer = (key: string, value: any) => {
        if (value && typeof value === 'object' && 'seconds' in value && 'nanoseconds' in value) {
          return `${value.seconds}.${value.nanoseconds}`;
        }
        return value;
      };
      lastSavedRef.current = JSON.stringify(potluck, replacer);
    }
  }, [potluck]);

  const isOwner = user?.uid === potluck?.ownerId;
  const canEdit = true;


  useEffect(() => {
    if (!id) return;
    const unsubscribe = onSnapshot(doc(db, 'potlucks', id), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const fullPotluck = { 
          title: "Untitled Potluck",
          description: "",
          totalPeople: 0,
          guests: [],
          dishes: [],
          ...data, 
          id: snapshot.id 
        } as Potluck;
        
        setPotluck(fullPotluck);
        potluckRef.current = fullPotluck;
        
        // Update lastSavedRef to match the server state
        const replacer = (key: string, value: any) => {
          if (value && typeof value === 'object' && 'seconds' in value && 'nanoseconds' in value) {
            return `${value.seconds}.${value.nanoseconds}`;
          }
          return value;
        };
        lastSavedRef.current = JSON.stringify(fullPotluck, replacer);
      } else {
        setPotluck(null);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching potluck", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [id]);

  const handleExport = () => {
    if (!potluck) return;
    // Create a clean copy for export
    const exportData = {
      title: potluck.title,
      description: potluck.description,
      totalPeople: potluck.totalPeople,
      guests: potluck.guests,
      dishes: potluck.dishes
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `${potluck.title.replace(/\s+/g, '_')}_export.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const handleSave = async (updatedPotluck?: Potluck | any, action?: string) => {
    // If updatedPotluck is an event (from onBlur), ignore it and use current state from ref
    const isPotluck = updatedPotluck && typeof updatedPotluck === 'object' && 'dishes' in updatedPotluck;
    const potluckToSave = isPotluck ? updatedPotluck : potluckRef.current;
    
    if (!potluckToSave || !id || !potluckToSave.title?.trim()) {
      console.log("Save skipped: No potluck data or missing title");
      return;
    }

    // Avoid unnecessary saves if nothing changed
    const replacer = (key: string, value: any) => {
      if (value && typeof value === 'object' && 'seconds' in value && 'nanoseconds' in value) {
        return `${value.seconds}.${value.nanoseconds}`;
      }
      return value;
    };
    
    const currentStringified = JSON.stringify(potluckToSave, replacer);
    if (currentStringified === lastSavedRef.current) {
      console.log("Save skipped: No changes detected");
      return;
    }

    console.log("Saving potluck and calling external API...");
    setIsSaving(true);
    try {
      const potluckWithVersion = {
        ...potluckToSave,
        version: (potluckToSave.version || 0) + 1
      };
      
      await saveToExternalApi(user, id, potluckWithVersion);
      await setDoc(doc(db, 'potlucks', id), potluckWithVersion);
      
      potluckRef.current = potluckWithVersion;
      lastSavedRef.current = JSON.stringify(potluckWithVersion, replacer);
      setIsSaving(false);
      setSaveError(null);
    } catch (error: any) {
      console.error("Save error:", error);
      setIsSaving(false);
      
      // Check for quota exceeded or other common errors
      if (error.code === 'resource-exhausted' || error.message?.includes('quota')) {
        setSaveError("Your daily database limit has been reached. Changes cannot be saved until tomorrow.");
      } else if (error.code === 'permission-denied') {
        setSaveError("Permission denied. You may not have permission to edit this potluck.");
        // Only trigger the ErrorBoundary for signed-in users who should have permission
        // Guests should just see the saveError message in the UI
        if (user) {
          handleFirestoreError(error, OperationType.UPDATE, `potlucks/${id}`);
        }
      } else {
        setSaveError(`An error occurred: ${error.message || "Please try again later."}`);
      }
    }
  };

  const handleReorderDishes = (newDishes: Dish[]) => {
    if (!potluck) return;
    const updated = { ...potluck, dishes: newDishes };
    setPotluck(updated);
    potluckRef.current = updated;
    handleSave(updated, "Reordered dishes");
  };

  const handleDelete = async () => {
    if (!id || !window.confirm("Are you sure you want to delete this potluck?")) return;
    try {
      await deleteDoc(doc(db, 'potlucks', id));
      navigate('/');
    } catch (error) {
      if (user) {
        handleFirestoreError(error, OperationType.DELETE, `potlucks/${id}`);
      } else {
        setSaveError("Permission denied. Only the owner can delete this potluck.");
      }
    }
  };

  const copyUrl = (e: React.MouseEvent) => {
    e.preventDefault();
    // Blur any active element to avoid triggering onBlur saves that might fail
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const addGuest = () => {
    if (!potluck) return;
    const newGuest: Guest = { id: uuidv4(), name: "" };
    const updated = { ...potluck, guests: [...potluck.guests, newGuest] };
    setPotluck(updated);
    handleSave(updated, "Added a new guest");
  };

  const removeGuest = (guestId: string) => {
    if (!potluck) return;
    const guest = potluck.guests.find(g => g.id === guestId);
    const updated = {
      ...potluck,
      guests: potluck.guests.filter(g => g.id !== guestId),
      dishes: potluck.dishes.map(d => ({
        ...d,
        ownerIds: d.ownerIds.filter(pid => pid !== guestId)
      }))
    };
    setPotluck(updated);
    potluckRef.current = updated;
    handleSave(updated, `Removed guest: ${guest?.name || "Unnamed"}`);
  };

  const updateGuest = (guestId: string, name: string) => {
    if (!potluck) return;
    const updated = {
      ...potluck,
      guests: potluck.guests.map(g => g.id === guestId ? { ...g, name } : g)
    };
    setPotluck(updated);
    potluckRef.current = updated;
  };

  const reorderGuests = (newGuests: Guest[]) => {
    if (!potluck) return;
    const updated = { ...potluck, guests: newGuests };
    setPotluck(updated);
    potluckRef.current = updated;
    handleSave(updated, "Reordered guests");
  };

  const addDish = () => {
    if (!potluck) return;
    const colors = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#F43F5E'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const newDish: Dish = { id: uuidv4(), name: "", description: "", count: 1, ownerIds: [], color: randomColor, locked: false };
    const updated = { ...potluck, dishes: [...potluck.dishes, newDish] };
    setPotluck(updated);
    potluckRef.current = updated;
    handleSave(updated, "Added a new dish");
  };

  const removeDish = (dishId: string) => {
    if (!potluck) return;
    const dish = potluck.dishes.find(d => d.id === dishId);
    const updated = { ...potluck, dishes: potluck.dishes.filter(d => d.id !== dishId) };
    setPotluck(updated);
    potluckRef.current = updated;
    handleSave(updated, `Removed dish: ${dish?.name || "Unnamed"}`);
  };

  const updateDish = (dishId: string, updates: Partial<Dish>) => {
    if (!potluck) return;
    const updated = {
      ...potluck,
      dishes: potluck.dishes.map(d => d.id === dishId ? { ...d, ...updates } : d)
    };
    setPotluck(updated);
    potluckRef.current = updated;
  };

  const toggleOwner = (dishId: string, guestId: string) => {
    if (!potluck || !canEdit) return;
    const dish = potluck.dishes.find(d => d.id === dishId);
    if (!dish) return;

    const newOwners = dish.ownerIds.includes(guestId)
      ? dish.ownerIds.filter(id => id !== guestId)
      : [...dish.ownerIds, guestId];

    const updated = {
      ...potluck,
      dishes: potluck.dishes.map(d => d.id === dishId ? { ...d, ownerIds: newOwners } : d)
    };
    setPotluck(updated);
    potluckRef.current = updated;
    handleSave(updated, "Toggled dish owner");
  };

  const toggleDishLock = (dishId: string) => {
    if (!potluck || !isOwner) return;
    const dish = potluck.dishes.find(d => d.id === dishId);
    if (!dish) return;
    const updated = {
      ...potluck,
      dishes: potluck.dishes.map(d => d.id === dishId ? { ...d, locked: !d.locked } : d)
    };
    setPotluck(updated);
    potluckRef.current = updated;
    handleSave(updated, `${dish.locked ? 'Unlocked' : 'Locked'} dish: ${dish.name || "Unnamed"}`);
  };

  const toggleGuestLock = (guestId: string) => {
    if (!potluck || !isOwner) return;
    const guest = potluck.guests.find(g => g.id === guestId);
    if (!guest) return;
    const updated = {
      ...potluck,
      guests: potluck.guests.map(g => g.id === guestId ? { ...g, locked: !g.locked } : g)
    };
    setPotluck(updated);
    handleSave(updated, `${guest.locked ? 'Unlocked' : 'Locked'} guest: ${guest.name || "Unnamed"}`);
  };

  const handleUrlSubmit = (e: React.FormEvent | string) => {
    let url: string;
    if (typeof e === 'string') {
      url = e;
    } else {
      e.preventDefault();
      url = tempUrl;
    }

    if (url.length > 200) {
      setSaveError("Image URL is too long (max 200 characters). Please use a shorter URL.");
      return;
    }

    if (activeDishForSearch && potluck) {
      const updated = {
        ...potluck,
        dishes: potluck.dishes.map(d => d.id === activeDishForSearch.id ? { ...d, imageUrl: url } : d)
      };
      setPotluck(updated);
      setImageSearchOpen(false);
      handleSave(updated, `Updated image for dish: ${activeDishForSearch.name || "Unnamed"}`);
      setActiveDishForSearch(null);
    } else if (urlEditId && potluck) {
      const updated = {
        ...potluck,
        dishes: potluck.dishes.map(d => d.id === urlEditId ? { ...d, imageUrl: url } : d)
      };
      setPotluck(updated);
      setUrlEditId(null);
      setTempUrl("");
      handleSave(updated);
    }
  };

  const openImageSearch = (dish: Dish) => {
    if (!canEdit) return;
    setActiveDishForSearch(dish);
    setImageSearchOpen(true);
  };

  if (loading) return (
    <div className="flex justify-center py-40">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
    </div>
  );

  if (!potluck) return (
    <div className="max-w-2xl mx-auto px-6 py-24 text-center">
      <h2 className="text-2xl font-bold text-zinc-900 mb-4">Potluck not found</h2>
      <Link to="/" className="text-emerald-600 font-medium hover:underline">Back to home</Link>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div className="flex-1">
          <Link to="/" className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-900 mb-4 transition-colors">
            <ArrowLeft size={16} />
            Back to Potlucks
          </Link>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 w-full min-w-0 overflow-hidden">
            {canEdit ? (
              <div className="flex-1 space-y-2 w-full min-w-0">
                {!user && (
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">
                    <Globe size={12} />
                    Public Editing Enabled
                  </div>
                )}
                <input 
                  type="text" 
                  value={potluck.title}
                  onChange={(e) => {
                    const updated = { ...potluck, title: e.target.value };
                    setPotluck(updated);
                    potluckRef.current = updated;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSave();
                      e.currentTarget.blur();
                    }
                  }}
                  onBlur={() => handleSave()}
                  className="text-2xl sm:text-4xl font-bold tracking-tight text-zinc-900 bg-transparent border-b-2 border-transparent hover:border-zinc-200 focus:border-emerald-500 focus:outline-none transition-all w-full min-w-0"
                />
                <textarea 
                  value={potluck.description || ""}
                  placeholder="Add a description..."
                  onChange={(e) => {
                    const updated = { ...potluck, description: e.target.value };
                    setPotluck(updated);
                    potluckRef.current = updated;
                  }}
                  onBlur={() => handleSave()}
                  className="w-full bg-transparent text-zinc-500 text-sm resize-none focus:outline-none border-b border-transparent hover:border-zinc-200 focus:border-emerald-500 transition-all py-1 min-w-0 break-words"
                  rows={2}
                />
              </div>
            ) : (
              <div className="flex-1 space-y-1 w-full min-w-0">
                <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-zinc-900 break-words">
                  {potluck.title}
                </h1>
                {potluck.description && <p className="text-zinc-500 text-sm break-words">{potluck.description}</p>}
              </div>
            )}
            <div className="flex flex-col items-center justify-center px-1 py-1.5 bg-blue-50 border border-blue-100 rounded-xl min-w-[40px] relative group/tooltip">
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-900 text-white text-[10px] rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 shadow-xl">
                Number of people this potluck serves
              </div>
              <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">People</span>
              {canEdit ? (
                <input 
                  type="number"
                  value={potluck.totalPeople || 0}
                  onChange={(e) => {
                    const updated = { ...potluck, totalPeople: parseInt(e.target.value) || 0 };
                    setPotluck(updated);
                    potluckRef.current = updated;
                  }}
                  onBlur={() => handleSave()}
                  title="Number of people this potluck serves"
                  className="text-xl font-black text-blue-700 bg-transparent w-full text-center focus:outline-none"
                />
              ) : (
                <span className="text-xl font-black text-blue-700">{potluck.totalPeople || 0}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-zinc-100 rounded-2xl p-1 border border-black/5">
            <div className="px-4 py-2 text-sm text-zinc-500 truncate max-w-[200px]">
              {window.location.href}
            </div>
            <button 
              onClick={copyUrl}
              className="p-2 bg-white rounded-xl shadow-sm hover:bg-zinc-50 transition-all text-zinc-600"
              title="Copy link"
            >
              {copied ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
            </button>
          </div>
          <button 
            onClick={handleExport}
            className="p-3 bg-white border border-black/5 text-zinc-600 rounded-2xl hover:bg-zinc-50 transition-all shadow-sm"
            title="Export Potluck"
          >
            <Download size={20} />
          </button>
          {isOwner && (
            <button 
              onClick={handleDelete}
              className="p-3 bg-red-50 text-red-600 rounded-2xl hover:bg-red-100 transition-all"
              title="Delete potluck"
            >
              <Trash2 size={20} />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-8">
        {/* Dishes Section */}
        <div className="w-full">
          <div className="bg-zinc-200 border border-black/5 rounded-3xl overflow-hidden shadow-sm">
            <div className="px-6 py-5 border-b border-black/5 bg-zinc-300 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-zinc-900">
                <Utensils size={20} className="text-green-500" />
                Dishes ({potluck.dishes.length})
              </div>
              {canEdit && (
                <button 
                  onClick={addDish}
                  className="p-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all"
                >
                  <Plus size={16} />
                </button>
              )}
            </div>
            <div className="p-6">
              <Reorder.Group 
                axis="y" 
                values={potluck.dishes} 
                onReorder={handleReorderDishes}
                className="space-y-8"
              >
                <AnimatePresence initial={false}>
                  {potluck.dishes.map((dish) => (
                    <DishItem 
                      key={dish.id}
                      dish={dish}
                      canEdit={canEdit}
                      isOwner={isOwner}
                      potluck={potluck}
                      updateDish={updateDish}
                      toggleOwner={toggleOwner}
                      openImageSearch={openImageSearch}
                      setDeleteConfirmId={(id) => {
                        setDeleteConfirmId(id);
                        setDeleteType(id ? 'dish' : null);
                      }}
                      handleSave={handleSave}
                      toggleDishLock={toggleDishLock}
                    />
                  ))}
                </AnimatePresence>
              </Reorder.Group>
              {potluck.dishes.length === 0 && (
                  <div className="text-center py-12 bg-zinc-200 rounded-2xl border-2 border-dashed border-zinc-300">
                  <p className="text-zinc-400 text-sm">No dishes added yet.</p>
                </div>
              )}
              {canEdit && (
                <button 
                  onClick={addDish}
                  className="w-full py-4 mt-4 border-2 border-dashed border-zinc-300 rounded-2xl text-zinc-400 hover:text-green-500 hover:border-green-500 hover:bg-green-50/50 transition-all flex items-center justify-center gap-2 font-medium"
                >
                  <Plus size={20} />
                  Add Another Dish
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Guests Section */}
        <div className="w-full">
          <div className="bg-zinc-100 border border-black/5 rounded-3xl overflow-hidden shadow-sm">
            <div className="px-6 py-5 border-b border-black/5 bg-zinc-200 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-zinc-900">
                <Users size={20} className="text-purple-500" />
                Guests ({potluck.guests.length})
              </div>
              {canEdit && (
                <button 
                  onClick={addGuest}
                  className="p-1.5 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-all"
                >
                  <Plus size={16} />
                </button>
              )}
            </div>
            <div className="p-6 space-y-4">
              <Reorder.Group axis="y" values={potluck.guests} onReorder={reorderGuests} className="space-y-4">
                <AnimatePresence initial={false}>
                  {potluck.guests.map((guest) => (
                    <GuestItem 
                      key={guest.id}
                      guest={guest}
                      potluck={potluck}
                      canEdit={canEdit}
                      isOwner={isOwner}
                      updateGuest={updateGuest}
                      removeGuest={removeGuest}
                      setDeleteConfirmId={(id) => {
                        setDeleteConfirmId(id);
                        setDeleteType(id ? 'guest' : null);
                      }}
                      handleSave={handleSave}
                      toggleGuestLock={toggleGuestLock}
                    />
                  ))}
                </AnimatePresence>
              </Reorder.Group>
              {potluck.guests.length === 0 && (
                <p className="text-center text-zinc-400 py-4 text-sm italic">No guests added yet.</p>
              )}
              {canEdit && (
                <button 
                  onClick={addGuest}
                  className="w-full py-4 mt-4 border-2 border-dashed border-zinc-300 rounded-2xl text-zinc-400 hover:text-purple-500 hover:border-purple-500 hover:bg-purple-50/50 transition-all flex items-center justify-center gap-2 font-medium"
                >
                  <Plus size={20} />
                  Add Another Guest
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {urlEditId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-zinc-900">Set Image URL</h3>
                <button 
                  onClick={() => setUrlEditId(null)}
                  className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
                >
                  <X size={20} className="text-zinc-400" />
                </button>
              </div>
              <form onSubmit={handleUrlSubmit} className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-bold text-zinc-400 mb-1 block">Image URL</label>
                  <input 
                    autoFocus
                    type="url" 
                    value={tempUrl}
                    onChange={(e) => setTempUrl(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    className="w-full px-4 py-2 bg-zinc-50 border border-transparent rounded-xl focus:bg-white focus:border-green-500 focus:outline-none transition-all"
                    maxLength={200}
                  />
                </div>
                <div className="flex gap-3">
                  <button 
                    type="button"
                    onClick={() => {
                      updateDish(urlEditId, { imageUrl: "" });
                      setUrlEditId(null);
                      handleSave();
                    }}
                    className="flex-1 px-4 py-2 border border-zinc-200 text-zinc-600 font-bold rounded-xl hover:bg-zinc-50 transition-all"
                  >
                    Remove
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-4 py-2 bg-zinc-900 text-white font-bold rounded-xl hover:bg-zinc-800 transition-all"
                  >
                    Save URL
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ImageSearchModal 
        isOpen={imageSearchOpen}
        onClose={() => setImageSearchOpen(false)}
        dishName={activeDishForSearch?.name || ""}
        currentUrl={activeDishForSearch?.imageUrl || ""}
        onSelect={handleUrlSubmit}
      />

      <AnimatePresence>
        {deleteConfirmId && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-8 text-center"
            >
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-zinc-900 mb-2">Delete this {deleteType}?</h3>
              <p className="text-zinc-500 mb-8">This action cannot be undone. Are you sure you want to remove this from the potluck?</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => {
                    setDeleteConfirmId(null);
                    setDeleteType(null);
                  }}
                  className="flex-1 px-6 py-3 bg-zinc-100 text-zinc-600 font-bold rounded-2xl hover:bg-zinc-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    if (deleteConfirmId) {
                      if (deleteType === 'dish') {
                        removeDish(deleteConfirmId);
                      } else if (deleteType === 'guest') {
                        removeGuest(deleteConfirmId);
                      }
                    }
                    setDeleteConfirmId(null);
                    setDeleteType(null);
                  }}
                  className="flex-1 px-6 py-3 bg-red-500 text-white font-bold rounded-2xl hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Save Error Dialog */}
      <AnimatePresence>
        {saveError && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl"
            >
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <X size={32} />
              </div>
              <h3 className="text-xl font-bold text-zinc-900 text-center mb-2">An error occurred</h3>
              <p className="text-zinc-500 text-center mb-8">
                {saveError}
              </p>
              <button 
                onClick={() => setSaveError(null)}
                className="w-full px-6 py-3 bg-zinc-900 text-white font-bold rounded-2xl hover:bg-zinc-800 transition-all"
              >
                Dismiss
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
    </div>
  );

  return (
    <ErrorBoundary>
      <Router>
        <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900">
          <Navbar user={user} />
          <main>
            <Routes>
              <Route path="/" element={<HomePage user={user} />} />
              <Route path="/potluck/:id" element={<PotluckDetail user={user} />} />
            </Routes>
          </main>
        </div>
      </Router>
    </ErrorBoundary>
  );
}
