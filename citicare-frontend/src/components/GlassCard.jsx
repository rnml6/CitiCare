const GlassCard = ({ children, className = '', onClick, hover = true }) => {
  return (
    <div 
      className={`glass-card ${hover ? 'glass-hover' : ''} ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

export default GlassCard;