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
  serverTimestamp
} from 'firebase/firestore';
import { getGenAIInstance } from './services/geminiService';
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
  History,
  Search,
  Key,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---
declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

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
        if (errData.error && errData.error.includes('Missing or insufficient permissions')) {
          message = "You don't have permission to perform this action. Please make sure you are signed in as the owner.";
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
}

interface Dish {
  id: string;
  name: string;
  count: number;
  ownerIds: string[];
  color?: string;
  imageUrl?: string;
}

interface Potluck {
  id: string;
  title: string;
  ownerId: string;
  createdAt: Timestamp;
  guests: Guest[];
  dishes: Dish[];
}

interface HistoryEntry {
  id: string;
  userId: string;
  userName: string;
  action: string;
  timestamp: Timestamp;
}

// --- History Modal ---

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  potluckId: string;
}

const HistoryModal = ({ isOpen, onClose, potluckId }: HistoryModalProps) => {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !potluckId) return;
    
    setLoading(true);
    const q = query(
      collection(db, 'potlucks', potluckId, 'history'),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const entries = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as HistoryEntry));
      setHistory(entries);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching history", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isOpen, potluckId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
      >
        <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between bg-zinc-50">
          <h3 className="font-bold text-zinc-900 flex items-center gap-2">
            <History size={18} className="text-emerald-500" />
            Potluck History
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-zinc-200 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-10 text-zinc-400">
              No history recorded yet.
            </div>
          ) : (
            <div className="space-y-6">
              {history.map((entry) => (
                <div key={entry.id} className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 font-bold text-xs">
                    {entry.userName?.charAt(0) || entry.userId.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-zinc-900 text-sm">{entry.userName || "Unknown User"}</span>
                      <span className="text-[10px] text-zinc-400">
                        {entry.timestamp?.toDate().toLocaleString() || "Just now"}
                      </span>
                    </div>
                    <p className="text-zinc-600 text-sm leading-relaxed">{entry.action}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

// --- Image Search Modal ---

interface ImageSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  dishName: string;
  onSelect: (url: string) => void;
}

const ImageSearchModal = ({ isOpen, onClose, dishName, onSelect }: ImageSearchModalProps) => {
  const [manualUrl, setManualUrl] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualUrl) {
      onSelect(manualUrl);
      setManualUrl("");
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenError(null);
    try {
      const ai = await getGenAIInstance();
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: `A high-quality, appetizing photo of ${dishName} on a clean background, professional food photography style.` }]
        }
      });
      
      let found = false;
      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            const imageUrl = `data:image/png;base64,${part.inlineData.data}`;
            onSelect(imageUrl);
            onClose();
            found = true;
            break;
          }
        }
      }
      
      if (!found) {
        setGenError("No image was generated. Please try a different dish name.");
      }
    } catch (error) {
      console.error('Error generating image:', error);
      setGenError("Failed to generate image. Please check your connection or try again later.");
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
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

        <div className="p-6 overflow-y-auto flex-1 space-y-8">
          {/* AI Generation */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">AI Generation</label>
            <button 
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Search size={20} />
                  Generate Image with AI
                </>
              )}
            </button>
            {genError && <p className="text-xs text-red-500 font-medium">{genError}</p>}
          </div>

          {/* Manual URL Input */}
          <form onSubmit={handleManualSubmit} className="space-y-3">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Manual URL</label>
            <div className="flex gap-2">
              <input 
                type="url" 
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="flex-1 px-4 py-3 bg-zinc-50 border border-black/5 rounded-xl focus:bg-white focus:border-emerald-500 focus:outline-none transition-all"
              />
              <button 
                type="submit"
                className="px-6 py-3 bg-zinc-900 text-white rounded-xl font-semibold hover:bg-zinc-800 transition-all"
              >
                Set URL
              </button>
            </div>
          </form>

          {/* Google Search URL */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Google Search URL</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                readOnly
                value={`https://www.google.com/search?q=${encodeURIComponent(dishName)}&udm=2`}
                className="flex-1 px-4 py-3 bg-zinc-100 border border-black/5 rounded-xl text-zinc-500 text-sm overflow-hidden text-ellipsis whitespace-nowrap"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(`https://www.google.com/search?q=${encodeURIComponent(dishName)}&udm=2`);
                }}
                className="p-3 bg-white border border-black/5 text-zinc-600 rounded-xl hover:bg-zinc-50 transition-all shadow-sm"
                title="Copy URL"
              >
                <Copy size={18} />
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-zinc-50 border-t border-black/5 flex items-center justify-between">
          <p className="text-[10px] text-zinc-400 max-w-[70%]">
            Paste an image URL directly or use the search link above to find one.
          </p>
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-zinc-600 hover:text-zinc-900 transition-colors"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// --- Components ---

const Navbar = ({ user }: { user: User | null }) => {
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
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
    <nav className="flex items-center justify-between px-6 py-4 bg-white border-b border-black/5 sticky top-0 z-50">
      <Link to="/" className="text-xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
        <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white">
          <Utensils size={18} />
        </div>
        Potluck Planner
      </Link>
      <div className="flex items-center gap-4">
        {user ? (
          <div className="flex items-center gap-3">
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
    </nav>
  );
};

const HomePage = ({ user }: { user: User | null }) => {
  const [potlucks, setPotlucks] = useState<Potluck[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      setPotlucks([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'potlucks'), 
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Potluck));
      setPotlucks(list);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching potlucks", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  const createNewPotluck = async () => {
    if (!user) {
      alert("Please sign in to create a potluck.");
      return;
    }
    const id = uuidv4();
    const newPotluck: Potluck = {
      id,
      title: "New Potluck",
      ownerId: user.uid,
      createdAt: Timestamp.now(),
      guests: [],
      dishes: []
    };

    try {
      await setDoc(doc(db, 'potlucks', id), newPotluck);
      navigate(`/potluck/${id}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `potlucks/${id}`);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-12">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 mb-2">Your Potlucks</h1>
          <p className="text-zinc-500">Coordinate meals and guests with ease.</p>
        </div>
        <button 
          onClick={createNewPotluck}
          className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-2xl font-semibold hover:bg-emerald-600 transition-all shadow-md hover:shadow-lg active:scale-95"
        >
          <Plus size={20} />
          Create New
        </button>
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
              className="group bg-white border border-black/5 rounded-3xl p-6 hover:shadow-xl hover:shadow-emerald-500/5 transition-all cursor-pointer relative overflow-hidden"
              onClick={() => navigate(`/potluck/${p.id}`)}
            >
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
                <span className="text-xs text-zinc-400">
                  {p.createdAt.toDate().toLocaleDateString()}
                </span>
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
                className="inline-flex items-center gap-2 px-6 py-2 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-all"
              >
                <Plus size={18} />
                Create Potluck
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
    </div>
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [imageSearchOpen, setImageSearchOpen] = useState(false);
  const [activeDishForSearch, setActiveDishForSearch] = useState<Dish | null>(null);

  const isOwner = user?.uid === potluck?.ownerId;
  const canEdit = true;

  const logHistory = async (action: string) => {
    if (!id) return;
    try {
      await addDoc(collection(db, 'potlucks', id, 'history'), {
        userId: user?.uid || "anonymous",
        userName: user?.displayName || user?.email || "Guest User",
        action,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error("Error logging history", error);
    }
  };

  useEffect(() => {
    if (!id) return;
    const unsubscribe = onSnapshot(doc(db, 'potlucks', id), (snapshot) => {
      if (snapshot.exists()) {
        setPotluck({ ...snapshot.data(), id: snapshot.id } as Potluck);
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

  const handleSave = async (updatedPotluck?: Potluck) => {
    const potluckToSave = updatedPotluck || potluck;
    if (!potluckToSave || !id) return;
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'potlucks', id), potluckToSave);
      await logHistory(`Updated potluck: ${potluckToSave.title}`);
      setIsSaving(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `potlucks/${id}`);
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !window.confirm("Are you sure you want to delete this potluck?")) return;
    try {
      await deleteDoc(doc(db, 'potlucks', id));
      navigate('/');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `potlucks/${id}`);
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const addGuest = () => {
    if (!potluck) return;
    const newGuest: Guest = { id: uuidv4(), name: "" };
    const updated = { ...potluck, guests: [...potluck.guests, newGuest] };
    setPotluck(updated);
    handleSave(updated);
    logHistory("Added a new guest");
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
    handleSave(updated);
    logHistory(`Removed guest: ${guest?.name || "Unnamed"}`);
  };

  const updateGuest = (guestId: string, name: string) => {
    if (!potluck) return;
    setPotluck({
      ...potluck,
      guests: potluck.guests.map(g => g.id === guestId ? { ...g, name } : g)
    });
  };

  const addDish = () => {
    if (!potluck) return;
    const colors = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#F43F5E'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const newDish: Dish = { id: uuidv4(), name: "", count: 1, ownerIds: [], color: randomColor };
    const updated = { ...potluck, dishes: [...potluck.dishes, newDish] };
    setPotluck(updated);
    handleSave(updated);
    logHistory("Added a new dish");
  };

  const removeDish = (dishId: string) => {
    if (!potluck) return;
    const dish = potluck.dishes.find(d => d.id === dishId);
    const updated = { ...potluck, dishes: potluck.dishes.filter(d => d.id !== dishId) };
    setPotluck(updated);
    handleSave(updated);
    logHistory(`Removed dish: ${dish?.name || "Unnamed"}`);
  };

  const updateDish = (dishId: string, updates: Partial<Dish>) => {
    if (!potluck) return;
    setPotluck({
      ...potluck,
      dishes: potluck.dishes.map(d => d.id === dishId ? { ...d, ...updates } : d)
    });
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
    handleSave(updated);
  };

  const handleUrlSubmit = (url: string) => {
    if (activeDishForSearch && potluck) {
      const updated = {
        ...potluck,
        dishes: potluck.dishes.map(d => d.id === activeDishForSearch.id ? { ...d, imageUrl: url } : d)
      };
      setPotluck(updated);
      setImageSearchOpen(false);
      setActiveDishForSearch(null);
      handleSave(updated);
      logHistory(`Updated image for dish: ${activeDishForSearch.name || "Unnamed"}`);
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
          <div className="flex items-center gap-4">
            {canEdit ? (
              <input 
                type="text" 
                value={potluck.title}
                onChange={(e) => setPotluck({ ...potluck, title: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSave();
                    e.currentTarget.blur();
                  }
                }}
                onBlur={handleSave}
                className="text-4xl font-bold tracking-tight text-zinc-900 bg-transparent border-b-2 border-transparent hover:border-zinc-200 focus:border-emerald-500 focus:outline-none transition-all w-full"
              />
            ) : (
              <h1 className="text-4xl font-bold tracking-tight text-zinc-900">{potluck.title}</h1>
            )}
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
            onClick={() => setHistoryOpen(true)}
            className="p-3 bg-white border border-black/5 text-zinc-600 rounded-2xl hover:bg-zinc-50 transition-all shadow-sm"
            title="View History"
          >
            <History size={20} />
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
          <div className="bg-white border border-black/5 rounded-3xl overflow-hidden shadow-sm">
            <div className="px-6 py-5 border-b border-black/5 bg-zinc-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-zinc-900">
                <Utensils size={20} className="text-emerald-500" />
                Dishes & Items ({potluck.dishes.length})
              </div>
              {canEdit && (
                <button 
                  onClick={addDish}
                  className="p-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all"
                >
                  <Plus size={16} />
                </button>
              )}
            </div>
            <div className="p-6 space-y-8">
              <AnimatePresence initial={false}>
                {potluck.dishes.map((dish) => (
                  <motion.div 
                    key={dish.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-zinc-50/50 border border-black/5 rounded-2xl p-6 relative group"
                  >
                    {canEdit && (
                      <button 
                        onClick={() => removeDish(dish.id)}
                        className="absolute top-4 right-4 p-2 text-zinc-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                    
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col md:flex-row gap-4 items-center">
                        <div 
                          className="w-[48px] h-[48px] rounded-xl flex-shrink-0 shadow-sm border border-black/5 overflow-hidden cursor-pointer group/img relative"
                          style={{ backgroundColor: !dish.imageUrl ? (dish.color || '#E5E7EB') : 'transparent' }}
                          onClick={() => openImageSearch(dish)}
                          title={canEdit ? "Click to set image" : ""}
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
                          
                          {canEdit && (
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                              <Plus size={16} className="text-white" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 flex flex-col md:flex-row gap-4 w-full">
                        <div className="flex-1">
                          {canEdit ? (
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
                              onBlur={handleSave}
                              className="w-full px-3 py-1.5 bg-white border border-transparent rounded-xl focus:border-emerald-500 focus:outline-none transition-all font-semibold text-zinc-900"
                            />
                          ) : (
                            <div className="font-semibold text-zinc-900">{dish.name || "Unnamed Dish"}</div>
                          )}
                        </div>
                        <div className="w-full md:w-24 relative group/tooltip">
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-900 text-white text-[10px] rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 shadow-xl">
                            Number of servings
                          </div>
                          {canEdit ? (
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
                              onBlur={handleSave}
                              className="w-full px-3 py-1.5 bg-white border border-transparent rounded-xl focus:border-emerald-500 focus:outline-none transition-all font-medium text-zinc-900 text-sm"
                            />
                          ) : (
                            <div className="font-medium text-zinc-700 text-sm">{dish.count} servings</div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-2 border-t border-black/5">
                        {potluck.guests.map((guest) => (
                          <button
                            key={guest.id}
                            disabled={!canEdit}
                            onClick={() => toggleOwner(dish.id, guest.id)}
                            className={`px-2 py-0.5 rounded-full text-xs font-medium transition-all ${
                              dish.ownerIds.includes(guest.id)
                                ? 'bg-emerald-500 text-white shadow-sm'
                                : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                            } ${!canEdit ? 'cursor-default' : ''}`}
                          >
                            {guest.name || "Guest"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {potluck.dishes.length === 0 && (
                <div className="text-center py-12 bg-zinc-50/50 rounded-2xl border-2 border-dashed border-zinc-200">
                  <p className="text-zinc-400 text-sm">No dishes added yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Guests Section */}
        <div className="w-full">
          <div className="bg-white border border-black/5 rounded-3xl overflow-hidden shadow-sm">
            <div className="px-6 py-5 border-b border-black/5 bg-zinc-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-zinc-900">
                <Users size={20} className="text-emerald-500" />
                Guests ({potluck.guests.length})
              </div>
              {canEdit && (
                <button 
                  onClick={addGuest}
                  className="p-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all"
                >
                  <Plus size={16} />
                </button>
              )}
            </div>
            <div className="p-6 space-y-4">
              <AnimatePresence initial={false}>
                {potluck.guests.map((guest) => (
                  <motion.div 
                    key={guest.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-3 group"
                  >
                    {canEdit ? (
                      <>
                        <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
                          <div className="w-10 h-10 rounded-xl flex-shrink-0 border border-black/5 bg-zinc-100 flex items-center justify-center text-zinc-400">
                            <Users size={16} />
                          </div>
                          <div className="relative min-w-[120px]">
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
                              onBlur={handleSave}
                              className="absolute inset-0 w-full px-4 py-2 bg-zinc-50 border border-transparent rounded-xl focus:bg-white focus:border-emerald-500 focus:outline-none transition-all"
                            />
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
                        <button 
                          onClick={() => removeGuest(guest.id)}
                          className="p-2 text-zinc-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    ) : (
                      <div className="flex-1 flex items-center justify-between gap-3 px-4 py-2 bg-zinc-50 rounded-xl min-w-0">
                        <span className="text-zinc-700 font-medium whitespace-nowrap flex-shrink-0">{guest.name || "Unnamed Guest"}</span>
                        <div className="flex flex-wrap gap-1 justify-end">
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
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              {potluck.guests.length === 0 && (
                <p className="text-center text-zinc-400 py-4 text-sm italic">No guests added yet.</p>
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
                    className="w-full px-4 py-2 bg-zinc-50 border border-transparent rounded-xl focus:bg-white focus:border-emerald-500 focus:outline-none transition-all"
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

      <HistoryModal 
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        potluckId={id || ""}
      />

      <ImageSearchModal 
        isOpen={imageSearchOpen}
        onClose={() => setImageSearchOpen(false)}
        dishName={activeDishForSearch?.name || ""}
        onSelect={handleUrlSubmit}
      />
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
        <div className="min-h-screen bg-[#FBFBFB] font-sans text-zinc-900">
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
