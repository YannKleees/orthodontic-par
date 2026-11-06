import "./PatientSidebar.css";

export default function PlusButton({
  title = "Add",
  onClick,
}: {
  title?: string;
  onClick: () => void;
}) {
  return (
    <button title={title} onClick={onClick} className="plusButton group ml-2">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="plusIcon">
        <path d="M12 22C17.5 22 22 17.5 22 12C22 6.5 17.5 2 12 2C6.5 2 2 6.5 2 12C2 17.5 6.5 22 12 22Z" strokeWidth="1.5" />
        <path d="M8 12H16" strokeWidth="1.5" />
        <path d="M12 16V8" strokeWidth="1.5" />
      </svg>
    </button>
  );
}
