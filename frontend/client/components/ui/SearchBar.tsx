import { useId, KeyboardEvent } from "react";
import { Search, X } from "lucide-react";
import "./PatientSidebar.css";             // re‑use existing styles

interface Props {
  value: string;
  onChange(v: string): void;
  placeholder: string;
  onEnter?: () => void;
}

export default function SearchBar({ value, onChange, placeholder, onEnter }: Props) {
  const id = useId();

  const keyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && onEnter) onEnter();
    else if (e.key === "Escape") onChange("");
  };

  return (
    <form onSubmit={(e) => e.preventDefault()} className="relative w-60">
      <input
        id={id}
        type="text"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={keyDown}
        className="peer w-full h-12 bg-white border border-[#fffff] rounded-xl
                   px-4 pr-10 text-base outline-none focus:shadow-md"
        placeholder=" "
      />
      <label
        htmlFor={id}
        className="absolute left-4 top-1/2 -translate-y-1/2 px-2 bg-white font-light text-base
                   peer-focus:top-0 peer-focus:left-3 peer-focus:text-sm peer-focus:text-[#4070f4]
                   peer-valid:-top-0 peer-valid:left-3 peer-valid:text-sm peer-valid:text-[#4070f4]
                   duration-150"
      >
        {placeholder}
      </label>

      {value ? (
        <X
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 cursor-pointer"
        />
      ) : (
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4070f4]" />
      )}
    </form>
  );
}
