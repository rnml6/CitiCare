const StatCard = ({ label, value, icon: Icon, color = 'blue' }) => {
  const colorClasses = {
    blue: 'from-blue-400 to-blue-600',
    green: 'from-emerald-400 to-emerald-600',
    purple: 'from-purple-400 to-purple-600',
    red: 'from-red-400 to-red-600',
    orange: 'from-orange-400 to-orange-600',
  };

  return (
    <div className="stat-card animate-slide-up">
      <div className={`flex p-2.5 sm:p-3 rounded-xl bg-gradient-to-br ${colorClasses[color]} shadow-lg flex-shrink-0`}>
        <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-white/50 truncate">{label}</p>
        <p className="text-xl sm:text-2xl font-bold text-white tabular-nums leading-tight mt-0.5">{value}</p>
      </div>
    </div>
  );
};

export default StatCard;
