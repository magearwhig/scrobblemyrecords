import React from 'react';

interface WrappedSlideProps {
  children: React.ReactNode;
  className?: string;
}

const WrappedSlide: React.FC<WrappedSlideProps> = ({
  children,
  className = '',
}) => {
  return (
    <div className={`wrapped-slide ${className}`}>
      <div className='wrapped-slide-content'>{children}</div>
    </div>
  );
};

export default WrappedSlide;
