import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import MobileBottomNav from './MobileBottomNav';

const Layout = () => {
  return (
    <div className="flex h-[100dvh] overflow-hidden relative z-10">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header />
        <main className="responsive-main flex-1 overflow-y-auto p-4 md:p-6 pb-10 lg:pb-6">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
};

export default Layout;
