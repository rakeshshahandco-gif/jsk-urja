import React, { useState } from 'react';
import { 
    LayoutDashboard, Package, Users, Users2, 
    LineChart, FlaskConical, FileBarChart, Globe 
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import WechatDashboardTab from '../components/WechatDashboardTab';
import WechatProductsTab from '../components/WechatProductsTab';
import WechatContactsTab from '../components/WechatContactsTab';
import WechatGroupsTab from '../components/WechatGroupsTab';
import WechatSamplesTab from '../components/WechatSamplesTab';
import WechatProductDetailsPage from './WechatProductDetailsPage';

const WechatLayout = () => {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [selectedContact, setSelectedContact] = useState(null);
    const [selectedGroup, setSelectedGroup] = useState(null);

    const navigation = [
        { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard },
        { id: 'products', name: 'Products (R&D)', icon: Package },
        { id: 'contacts', name: 'Contacts', icon: Users },
        { id: 'groups', name: 'WeChat Groups', icon: Users2 },
        { id: 'prices', name: 'Price Comparison', icon: LineChart },
        { id: 'samples', name: 'Samples Tracking', icon: FlaskConical },
        { id: 'reports', name: 'Reports', icon: FileBarChart },
    ];

    const renderContent = () => {
        if (selectedProduct) {
            return <WechatProductDetailsPage product={selectedProduct} onBack={() => setSelectedProduct(null)} />;
        }

        switch (activeTab) {
            case 'dashboard': return <WechatDashboardTab onNavigate={setActiveTab} />;
            case 'products': return <WechatProductsTab onSelectProduct={setSelectedProduct} />;
            case 'contacts': return <WechatContactsTab onSelectContact={setSelectedContact} />;
            case 'groups': return <WechatGroupsTab onSelectGroup={setSelectedGroup} />;
            case 'prices': return <div className="p-8"><h2 className="text-2xl font-bold text-slate-800">Global Price Comparison</h2><p className="text-slate-500 mt-2">Select a product to compare suppliers side-by-side.</p></div>;
            case 'samples': return <WechatSamplesTab />;
            case 'reports': return <div className="p-8"><h2 className="text-2xl font-bold">Reports (WIP)</h2></div>;
            default: return <WechatDashboardTab onNavigate={setActiveTab} />;
        }
    };

    return (
        <div className="flex h-[calc(100vh-64px)] bg-[#f8fafc]">
            {/* Left Sidebar Sub-navigation */}
            <div className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center gap-3 text-emerald-600 mb-2">
                        <Globe size={24} className="stroke-[2.5px]" />
                        <h1 className="text-lg font-black tracking-tight text-slate-800">Supplier Intel</h1>
                    </div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">China Sourcing & R&D</p>
                </div>
                
                <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto custom-scrollbar">
                    {navigation.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            className={cn(
                                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-200",
                                activeTab === item.id 
                                    ? "bg-emerald-50 text-emerald-700 shadow-sm ring-1 ring-emerald-200" 
                                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                            )}
                        >
                            <item.icon size={18} className={cn(
                                "transition-colors",
                                activeTab === item.id ? "text-emerald-600" : "text-slate-400"
                            )} />
                            {item.name}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden relative">
                {renderContent()}
            </div>
        </div>
    );
};

export default WechatLayout;
