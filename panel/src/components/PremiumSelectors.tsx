import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  CheckCircle2, 
  XCircle, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Search, 
  Clock 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const SelectionModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  options: { value: string | number; label: string }[];
  onSelect: (val: string) => void;
  selectedValue: string;
}> = ({ isOpen, onClose, title, options, onSelect, selectedValue }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const filtered = options.filter(o => o.label.toLowerCase().includes(searchTerm.toLowerCase()));

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-overlay-premium" style={{ zIndex: 999999 }} onClick={onClose}>
       <motion.div 
         initial={{ opacity: 0, scale: 0.9, y: 20 }}
         animate={{ opacity: 1, scale: 1, y: 0 }}
         exit={{ opacity: 0, scale: 0.9, y: 20 }}
         className="modal-luxury selection-sub-modal" 
         onClick={e => e.stopPropagation()}
       >
          <div className="modal-top">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.4rem' }}>{title}</h2>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><XCircle size={24}/></button>
            </div>
          </div>
          
          <div className="search-box-wrapper" style={{ position: 'relative', marginBottom: '1.25rem', display: 'flex', alignItems: 'center' }}>
            <Search size={18} style={{ position: 'absolute', left: '14px', color: '#94a3b8', pointerEvents: 'none' }} />
            <input 
              autoFocus
              className="selection-search-input"
              placeholder="Ara..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="selection-list scrollbar-hidden" style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {filtered.length > 0 ? filtered.map(opt => (
              <div 
                key={opt.value} 
                className={`custom-option-premium ${String(opt.value) === String(selectedValue) ? 'active' : ''}`}
                onClick={() => { onSelect(String(opt.value)); onClose(); }}
              >
                <span>{opt.label}</span>
                {String(opt.value) === String(selectedValue) && <CheckCircle2 size={16} />}
              </div>
            )) : (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>Sonuç bulunamadı.</div>
            )}
          </div>
       </motion.div>
    </div>,
    document.body
  );
};

export const CustomSelect: React.FC<{
  label: string;
  value: string;
  options: { value: string | number; label: string }[];
  onChange: (val: string) => void;
  placeholder?: string;
  title?: string;
}> = ({ label, value, options, onChange, placeholder, title }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const selectedLabel = options.find(o => String(o.value) === String(value))?.label || placeholder || 'Seçiniz...';

  return (
    <div className="custom-select-container">
      <label>{label}</label>
      <div className="custom-select-trigger" onClick={() => setIsModalOpen(true)}>
        <span>{selectedLabel}</span>
        <ChevronRight size={16} className="chevron" />
      </div>
      
      <SelectionModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={title || label || 'Seçim Yapın'}
        options={options}
        selectedValue={value}
        onSelect={onChange}
      />
    </div>
  );
};

export const CustomDatePicker: React.FC<{
  label: string;
  value: string;
  onChange: (val: string) => void;
}> = ({ label, value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();
  
  const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  const weekdays = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"];

  const handlePrevMonth = (e: any) => { e.stopPropagation(); setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)); };
  const handleNextMonth = (e: any) => { e.stopPropagation(); setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)); };

  const handleDateSelect = (day: number) => {
    const year = currentMonth.getFullYear();
    const month = String(currentMonth.getMonth() + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    onChange(`${year}-${month}-${d}`);
    setIsOpen(false);
  };

  const renderDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const totalDays = daysInMonth(year, month);
    const firstDay = (firstDayOfMonth(year, month) + 6) % 7;
    const days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
    for (let d = 1; d <= totalDays; d++) {
      const dateToCheck = new Date(year, month, d);
      const isPast = dateToCheck < today;
      const isSelected = value === `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      
      days.push(
        <div 
          key={d} 
          className={`calendar-day ${isSelected ? 'active' : ''} ${isPast ? 'disabled' : ''}`} 
          onClick={() => !isPast && handleDateSelect(d)}
        >
          {d}
        </div>
      );
    }
    return days;
  };

  return (
    <div className="custom-datepicker-container">
      <label>{label}</label>
      <div className={`custom-input-trigger ${isOpen ? 'open' : ''}`} onClick={() => setIsOpen(!isOpen)}>
        <CalendarIcon size={16} />
        <span>{value || 'Tarih Seçin'}</span>
      </div>
      <AnimatePresence>
        {isOpen && (
          <>
            <div className="custom-select-overlay" onClick={() => setIsOpen(false)} />
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="calendar-popover">
              <div className="calendar-header">
                <button type="button" onClick={handlePrevMonth}><ChevronRight style={{ transform: 'rotate(180deg)' }} size={16} /></button>
                <span>{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</span>
                <button type="button" onClick={handleNextMonth}><ChevronRight size={16} /></button>
              </div>
              <div className="calendar-weekdays">
                {weekdays.map(w => <div key={w}>{w}</div>)}
              </div>
              <div className="calendar-grid">
                {renderDays()}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export const CustomTimePicker: React.FC<{
  label: string;
  value: string;
  onChange: (val: string) => void;
}> = ({ label, value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minutes = ["00", "15", "30", "45"];

  return (
    <div className="custom-datepicker-container">
      <label>{label}</label>
      <div className={`custom-input-trigger ${isOpen ? 'open' : ''}`} onClick={() => setIsOpen(!isOpen)}>
        <Clock size={16} />
        <span>{value || '00:00'}</span>
      </div>
      <AnimatePresence>
        {isOpen && (
          <>
            <div className="custom-select-overlay" onClick={() => setIsOpen(false)} />
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="time-popover">
              <div className="time-scroll-container">
                <div className="time-column">
                  {hours.map(h => (
                    <div key={h} className={`time-item ${value.startsWith(h) ? 'active' : ''}`} onClick={() => onChange(`${h}:${value.split(':')[1] || '00'}`)}>
                      {h}
                    </div>
                  ))}
                </div>
                <div className="time-column">
                  {minutes.map(m => (
                    <div key={m} className={`time-item ${value.endsWith(m) ? 'active' : ''}`} onClick={() => onChange(`${value.split(':')[0] || '00'}:${m}`)}>
                      {m}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
